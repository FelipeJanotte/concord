#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TransformProcessing {
    Synchronous,
    Asynchronous,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StartMessage {
    BeginStreaming,
    StartOfStream,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum OnRefusal {
    Fail,
    Log,
}

pub(crate) fn stream_start_messages(
    processing: TransformProcessing,
) -> [(StartMessage, OnRefusal); 2] {
    let start_of_stream = match processing {
        TransformProcessing::Asynchronous => OnRefusal::Fail,
        TransformProcessing::Synchronous => OnRefusal::Log,
    };
    [
        (StartMessage::BeginStreaming, OnRefusal::Log),
        (StartMessage::StartOfStream, start_of_stream),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asynchronous_transform_must_accept_the_start_of_stream() {
        assert_eq!(
            stream_start_messages(TransformProcessing::Asynchronous),
            [
                (StartMessage::BeginStreaming, OnRefusal::Log),
                (StartMessage::StartOfStream, OnRefusal::Fail),
            ]
        );
    }

    #[test]
    fn synchronous_transform_may_refuse_both_optional_messages() {
        assert_eq!(
            stream_start_messages(TransformProcessing::Synchronous),
            [
                (StartMessage::BeginStreaming, OnRefusal::Log),
                (StartMessage::StartOfStream, OnRefusal::Log),
            ]
        );
    }
}
