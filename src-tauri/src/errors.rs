#[macro_export]
macro_rules! domain_error {
    ($name:ident { $($variants:tt)* }) => {
        #[derive(Debug, thiserror::Error)]
        pub enum $name {
            $($variants)*
        }

        impl serde::Serialize for $name {
            fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_str(&self.to_string())
            }
        }
    };
}

#[cfg(test)]
mod tests {
    domain_error!(SampleError {
        #[error("falhou: {0}")]
        Failed(String),
    });

    #[test]
    fn serializes_as_its_message() -> Result<(), serde_json::Error> {
        let json = serde_json::to_string(&SampleError::Failed("disco".into()))?;
        assert_eq!(json, "\"falhou: disco\"");
        Ok(())
    }
}
