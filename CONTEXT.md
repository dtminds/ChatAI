# ChatAI

ChatAI is a marketing and service automation product. Its Workflow domain coordinates durable customer journeys across ChatAI conversations and external business channels without requiring those channels to share one universal customer identity.

## Workflow Language

**Workflow Type**:
The stable business domain selected when a Workflow is created. It fixes the Workflow's primary Subject Type and the capabilities that are semantically valid for that Workflow. Workflow Type governs orchestration capability; it is not an identity namespace.
_Avoid_: Workflow category, template type

**ChatAI SOP**:
A Workflow Type identified by `chatai_sop`. Its primary Subject Type is `chatai_contact`, and its capability set may include ChatAI messages, conversations, Agents, and AI nodes.
_Avoid_: ChatAI Workflow

**WeCom SOP**:
A Workflow Type identified by `wecom_sop`. Its primary Subject Type is `wecom_contact`, and its capability set is independent of ChatAI conversation or seat capabilities.
_Avoid_: Customer SOP, `customer_sop`

**Member SOP**:
A reserved Workflow Type identified by `member_sop`. Its primary Subject Type is `miniapp_member`. It exists in the stable enum but is unavailable in the current phase.
_Avoid_: Customer SOP

**Workflow Subject**:
The business entity whose journey a Workflow Run represents. A subject is identified within a Subject Type rather than by a universal cross-domain customer ID.
_Avoid_: Unified customer, generic customer

**Subject Type**:
The identity namespace that gives a Workflow Subject ID its business meaning. The current stable values are `chatai_contact`, `wecom_contact`, and the reserved `miniapp_member`. Runtime identity is the combination of Subject Type and Subject ID.
_Avoid_: ID type

**Workflow Capability Profile**:
The semantic capability boundary of a Workflow Type, including valid entry events, nodes, variables, and business operations. It states what belongs in that type of Workflow, independently of whether the Runtime, current deployment, or tenant entitlement can use it yet.
_Avoid_: Permission set, subscription plan, runtime support list

**Workflow Runtime Support**:
The set of Workflow node semantics that the currently deployed Node execution artifact can compile and execute completely, including validation, outputs, failure handling, and recovery behavior. Runtime Support states implementation completeness, not whether an environment or tenant may use the capability.
_Avoid_: Node catalog, deployment switch

**Workflow Deployment Capability**:
An environment-level declaration that a Runtime-supported event source or business operation is intentionally connected and enabled for production use. It is independent of transient service health and tenant-specific Product Entitlement.
_Avoid_: Runtime Support, tenant allowlist, health check

**Workflow Production Availability**:
The effective permission to publish, enable, or progress a Workflow capability after intersecting its Workflow Capability Profile, Workflow Runtime Support, Workflow Deployment Capability, Product Entitlement, and required business resources.
_Avoid_: Runtime whitelist, node visibility

**Workflow Capability Requirement**:
A versioned event-source or business-operation dependency frozen into a Workflow Revision by compilation. Production Availability requires the current environment to provide every Capability Requirement used by that Revision.
_Avoid_: Current deployment status, tenant entitlement

**Product Entitlement**:
A tenant's purchased or enabled product capability. It controls commercial access independently from the semantic boundaries of a Workflow Type.
_Avoid_: Workflow Type

**Workflow Entitlement Suspension**:
A recoverable system pause applied when Java reports that a tenant no longer has the Product Entitlement for a Workflow Type. It blocks new work without immediately making the Workflow terminal; prolonged loss may later cause a permanent stop at the next execution boundary.
_Avoid_: User pause, immediate stop

**Workflow Entry Event**:
A versioned business fact produced by Java that may start or wake zero or more Workflows. It identifies one Workflow Subject but never names a target Workflow, Workflow Type, Revision, or Run.
_Avoid_: Workflow command, target workflow event

**Workflow Event ID**:
The stable, tenant-unique identity of one Workflow Entry Event. At-least-once redelivery preserves the same Event ID and event content; transport message IDs do not replace it.
_Avoid_: Pulsar message ID

**Workflow Event Catalog**:
The registry of supported Event Type and Payload Version pairs. Each entry declares the applicable Subject Types, payload schema, and the controlled projection that Workflow nodes may persist or reference.
_Avoid_: Free-form event name list

**Workflow Entry DLQ**:
The quarantine path for permanently invalid Workflow Entry Events, including malformed envelopes, unsupported versions, unknown event types, invalid payloads, and size-limit violations. A DLQ record preserves diagnostic metadata without logging the full payload.
_Avoid_: Retry queue

**Workflow Trigger Projection**:
The bounded, event-specific subset of an Entry Event payload that is retained for a Run or exposed as node output. Matching may inspect the complete validated event, but Runtime state does not permanently copy the raw payload.
_Avoid_: Raw event snapshot
