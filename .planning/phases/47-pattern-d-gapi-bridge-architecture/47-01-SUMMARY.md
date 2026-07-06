# 47-01 Summary: Pattern-D Decision

Pattern-D generic execution is explicitly rejected for this phase.

Reason: the current T1 substrate is same-origin bound-spec execution. Separate-origin APIs cannot safely receive active-tab credentials unless a new bridge defines token containment, page-script boundaries, consent behavior, and negative controls. Shipping a generic cross-origin executor here would weaken Wall 2.
