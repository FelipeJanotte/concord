pub(crate) const SAMPLE_RATE: u32 = 48_000;
pub(crate) const CHANNELS: u32 = 2;
pub(crate) const SAMPLES_PER_CHANNEL: u32 = SAMPLE_RATE / 100;
pub(crate) const FRAME_SAMPLES: usize = (SAMPLES_PER_CHANNEL * CHANNELS) as usize;

const FRAME_BYTES: usize = FRAME_SAMPLES * 2;

#[derive(Debug, Default)]
pub(crate) struct AudioChunker {
    pending: Vec<u8>,
}

impl AudioChunker {
    pub fn push_little_endian(&mut self, bytes: &[u8]) {
        self.pending.extend_from_slice(bytes);
    }

    pub fn next_frame(&mut self) -> Option<Vec<i16>> {
        (self.pending.len() >= FRAME_BYTES).then(|| {
            self.pending
                .drain(..FRAME_BYTES)
                .collect::<Vec<u8>>()
                .as_chunks::<2>()
                .0
                .iter()
                .map(|pair| i16::from_le_bytes(*pair))
                .collect()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn little_endian(samples: impl IntoIterator<Item = i16>) -> Vec<u8> {
        samples.into_iter().flat_map(i16::to_le_bytes).collect()
    }

    #[test]
    fn ten_milliseconds_of_stereo_48k_is_960_samples() {
        assert_eq!(FRAME_SAMPLES, 960);
    }

    #[test]
    fn emits_nothing_until_a_full_frame_is_buffered() {
        let mut chunker = AudioChunker::default();
        chunker.push_little_endian(&little_endian(vec![1; FRAME_SAMPLES - 1]));
        assert_eq!(chunker.next_frame(), None);
    }

    #[test]
    fn splits_arbitrary_packets_into_exact_frames_in_order() {
        let mut chunker = AudioChunker::default();
        let samples: Vec<i16> = (0..2500).map(|index| (index % 30_000) as i16).collect();
        let bytes = little_endian(samples.iter().copied());
        chunker.push_little_endian(&bytes[..1001]);
        chunker.push_little_endian(&bytes[1001..]);
        let first = chunker.next_frame();
        let second = chunker.next_frame();
        assert_eq!(first.as_deref(), Some(&samples[..FRAME_SAMPLES]));
        assert_eq!(
            second.as_deref(),
            Some(&samples[FRAME_SAMPLES..2 * FRAME_SAMPLES])
        );
        assert_eq!(chunker.next_frame(), None);
        chunker.push_little_endian(&little_endian(vec![7; 3 * FRAME_SAMPLES - 2500]));
        let third = chunker.next_frame();
        assert_eq!(third.as_ref().map(Vec::len), Some(FRAME_SAMPLES));
        assert_eq!(
            third.as_ref().map(|frame| frame[0]),
            Some(samples[2 * FRAME_SAMPLES])
        );
        assert_eq!(
            third.as_ref().map(|frame| frame[FRAME_SAMPLES - 1]),
            Some(7)
        );
    }

    #[test]
    fn decodes_negative_little_endian_samples() {
        let mut chunker = AudioChunker::default();
        chunker.push_little_endian(&little_endian(vec![-2; FRAME_SAMPLES]));
        assert_eq!(chunker.next_frame(), Some(vec![-2; FRAME_SAMPLES]));
    }
}
