# Proposal Truth Source

state.json's `pointer` and `items[]` are authoritative for lifecycle/execution progress (T2/T3).
proposal.json's `lifecycle_status` is authoritative for active/blocked/done/archived.
Session runtime files (runtime/sessions/*.json) are hints only and must NEVER
override or contradict state.json/proposal.json values.

When injecting context, always read pointer and item status from state.json — never
from session runtime data.
