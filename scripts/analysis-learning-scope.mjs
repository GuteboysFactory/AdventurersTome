// Source choices affect their source. Campaign defaults and unknown policy
// fields remain global dependencies, so new policy cannot silently be ignored.
export function globalLearning(state={}){const {sourceChoices,sourceIgnores,decisionHistory,...global}=state;return global;}
export function sourceLearning(state={},uuid){return {choices:state.sourceChoices?.[uuid]||{},ignores:state.sourceIgnores?.[uuid]||{}};}
