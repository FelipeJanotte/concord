#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum LoopbackScope {
    ExcludeConcordProcessTree,
}

impl LoopbackScope {
    pub(crate) fn includes_process_tree(self) -> bool {
        match self {
            Self::ExcludeConcordProcessTree => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excluding_the_concord_tree_does_not_include_the_process_tree() {
        assert!(!LoopbackScope::ExcludeConcordProcessTree.includes_process_tree());
    }
}
