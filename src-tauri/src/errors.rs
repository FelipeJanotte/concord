#[macro_export]
macro_rules! domain_error {
    ($name:ident { $($variants:tt)* }) => {
        #[derive(Debug, thiserror::Error)]
        pub enum $name {
            #[error("Recurso nativo ainda não implementado")]
            NotImplemented,
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
    fn serializes_as_its_message() {
        let json = serde_json::to_string(&SampleError::NotImplemented).unwrap_or_default();
        assert_eq!(json, "\"Recurso nativo ainda não implementado\"");
    }

    #[test]
    fn extra_variants_carry_their_own_message() {
        let json = serde_json::to_string(&SampleError::Failed("disco".into())).unwrap_or_default();
        assert_eq!(json, "\"falhou: disco\"");
    }
}
