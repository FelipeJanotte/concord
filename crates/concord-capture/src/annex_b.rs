pub(crate) const NAL_TYPE_IDR: u8 = 5;
pub(crate) const NAL_TYPE_SPS: u8 = 7;
pub(crate) const NAL_TYPE_PPS: u8 = 8;

const NAL_TYPE_MASK: u8 = 0x1f;
const START_CODE: [u8; 3] = [0, 0, 1];

struct NalUnit<'a> {
    unit_type: u8,
    bytes: &'a [u8],
}

fn nal_units(access_unit: &[u8]) -> Vec<NalUnit<'_>> {
    let starts: Vec<(usize, usize)> = access_unit
        .windows(4)
        .enumerate()
        .filter(|(_, window)| window[..3] == START_CODE)
        .map(|(index, _)| {
            let with_leading_zero = index > 0 && access_unit[index - 1] == 0;
            (if with_leading_zero { index - 1 } else { index }, index + 3)
        })
        .collect();
    starts
        .iter()
        .enumerate()
        .map(|(position, &(start, header))| {
            let end = starts
                .get(position + 1)
                .map_or(access_unit.len(), |next| next.0);
            NalUnit {
                unit_type: access_unit[header] & NAL_TYPE_MASK,
                bytes: &access_unit[start..end],
            }
        })
        .collect()
}

pub(crate) fn nal_unit_types(access_unit: &[u8]) -> Vec<u8> {
    nal_units(access_unit)
        .iter()
        .map(|unit| unit.unit_type)
        .collect()
}

pub(crate) fn is_keyframe(access_unit: &[u8]) -> bool {
    nal_unit_types(access_unit).contains(&NAL_TYPE_IDR)
}

fn parameter_set_bytes(access_unit: &[u8]) -> Vec<u8> {
    nal_units(access_unit)
        .iter()
        .filter(|unit| matches!(unit.unit_type, NAL_TYPE_SPS | NAL_TYPE_PPS))
        .flat_map(|unit| unit.bytes.iter().copied())
        .collect()
}

#[derive(Debug, Default)]
pub(crate) struct ParameterSets {
    latest: Vec<u8>,
}

impl ParameterSets {
    pub fn remember(&mut self, sequence_header: &[u8]) {
        let parameter_sets = parameter_set_bytes(sequence_header);
        if !parameter_sets.is_empty() {
            self.latest = parameter_sets;
        }
    }

    pub fn complete(&mut self, access_unit: Vec<u8>) -> Vec<u8> {
        let types = nal_unit_types(&access_unit);
        if types.contains(&NAL_TYPE_SPS) {
            self.remember(&access_unit);
            return access_unit;
        }
        if !types.contains(&NAL_TYPE_IDR) || self.latest.is_empty() {
            return access_unit;
        }
        let mut completed = self.latest.clone();
        completed.extend_from_slice(&access_unit);
        completed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPS: [u8; 4] = [0x67, 0x42, 0xc0, 0x1f];
    const PPS: [u8; 3] = [0x68, 0xce, 0x3c];
    const IDR: [u8; 3] = [0x65, 0x88, 0x84];
    const SLICE: [u8; 3] = [0x41, 0x9a, 0x02];

    fn access_unit(units: &[&[u8]], long_start_code: bool) -> Vec<u8> {
        let mut bytes = Vec::new();
        for unit in units {
            if long_start_code {
                bytes.push(0);
            }
            bytes.extend_from_slice(&[0, 0, 1]);
            bytes.extend_from_slice(unit);
        }
        bytes
    }

    #[test]
    fn lists_units_after_both_start_code_lengths() {
        let mut bytes = access_unit(&[&SPS], true);
        bytes.extend(access_unit(&[&PPS, &IDR], false));
        assert_eq!(
            nal_unit_types(&bytes),
            vec![NAL_TYPE_SPS, NAL_TYPE_PPS, NAL_TYPE_IDR]
        );
    }

    #[test]
    fn idr_access_unit_is_a_keyframe() {
        assert!(is_keyframe(&access_unit(&[&SPS, &PPS, &IDR], true)));
    }

    #[test]
    fn non_idr_slice_is_a_delta_frame() {
        assert!(!is_keyframe(&access_unit(&[&SLICE], true)));
    }

    #[test]
    fn idr_without_parameter_sets_gets_the_last_ones_seen() {
        let mut sets = ParameterSets::default();
        let first = access_unit(&[&SPS, &PPS, &IDR], true);
        assert_eq!(sets.complete(first.clone()), first);
        let bare_idr = access_unit(&[&IDR], true);
        let mut expected = access_unit(&[&SPS, &PPS], true);
        expected.extend_from_slice(&bare_idr);
        assert_eq!(sets.complete(bare_idr), expected);
    }

    #[test]
    fn newer_parameter_sets_replace_older_ones() {
        let mut sets = ParameterSets::default();
        sets.complete(access_unit(&[&SPS, &PPS, &IDR], true));
        let newer_sps = [0x67, 0x64, 0x00, 0x28];
        sets.complete(access_unit(&[&newer_sps, &PPS, &IDR], false));
        let mut expected = access_unit(&[&newer_sps, &PPS], false);
        expected.extend(access_unit(&[&IDR], true));
        assert_eq!(sets.complete(access_unit(&[&IDR], true)), expected);
    }

    #[test]
    fn delta_frames_are_never_changed() {
        let mut sets = ParameterSets::default();
        sets.complete(access_unit(&[&SPS, &PPS, &IDR], true));
        let delta = access_unit(&[&SLICE], true);
        assert_eq!(sets.complete(delta.clone()), delta);
    }

    #[test]
    fn sequence_header_from_the_media_type_seeds_the_first_idr() {
        let mut sets = ParameterSets::default();
        sets.remember(&access_unit(&[&SPS, &PPS], true));
        let mut expected = access_unit(&[&SPS, &PPS], true);
        expected.extend(access_unit(&[&IDR], true));
        assert_eq!(sets.complete(access_unit(&[&IDR], true)), expected);
    }

    #[test]
    fn idr_is_left_alone_when_no_parameter_sets_are_known() {
        let mut sets = ParameterSets::default();
        let bare_idr = access_unit(&[&IDR], true);
        assert_eq!(sets.complete(bare_idr.clone()), bare_idr);
    }

    #[test]
    fn bytes_without_start_codes_have_no_units() {
        assert!(nal_unit_types(&[0x65, 0x00, 0x00, 0x02, 0x41]).is_empty());
        assert!(nal_unit_types(&[]).is_empty());
        assert!(nal_unit_types(&[0, 0, 1]).is_empty());
    }
}
