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

**WeCom Member**:
The WeCom employee account identified in Workflow contracts by `workUserId`. For `contact.friend_added` and `contact.tag_added`, it is the stable source identity used to match Workflow interest. Within one tenant, a WeCom Member has zero or one active ChatAI Seat.
_Avoid_: Managed account, generic account

**ChatAI Seat**:
The ChatAI service resource identified in Workflow contracts by `seatId`. Every active ChatAI Seat belongs to exactly one WeCom Member. It is the source identity for ChatAI-owned events such as `message.received`, but it is not a Workflow Subject.
_Avoid_: Account ID, Workflow customer

**WeCom Contact**:
The WeCom friend identified in Workflow contracts by `externalUserId`. It is the Subject of a WeCom SOP Run.
_Avoid_: ChatAI contact

**ChatAI Seat Contact**:
The ChatAI seat friend identified in Workflow contracts by `thirdExternalUserId`. It is the Subject of a ChatAI SOP Run.
_Avoid_: `external_third_userid`, WeCom contact

**Workflow Capability Profile**:
The semantic capability boundary of a Workflow Type, including valid entry events, nodes, variables, and business operations. It states what belongs in that type of Workflow, independently of whether the Runtime, current deployment, or tenant entitlement can use it yet.
_Avoid_: Permission set, subscription plan, runtime support list

**Workflow Runtime Support**:
The set of Workflow node semantics that the currently deployed Node execution artifact can compile and execute completely, including validation, outputs, failure handling, and recovery behavior. Runtime Support states implementation completeness, not whether an environment or tenant may use the capability.
_Avoid_: Node catalog, deployment switch

**Workflow Node Execution Class**:
The one stable execution category assigned to each Node Kind: `core`, `action`, `query`, `inference`, or `composite`. The class selects the execution mechanism and reliability envelope; it is independent from node maturity and production availability. Core nodes execute inside the Workflow engine. Action, Query, and Inference nodes invoke a typed Workflow Capability. Composite nodes coordinate multiple durable stages and cannot be registered as one direct Capability call.
_Avoid_: Node group, maturity, runtime support

**Workflow Capability Kind**:
The closed category of a typed external Capability invocation: `action`, `query`, or `inference`. An Action causes an externally visible side effect and carries an idempotency key. A Query is read-only. Inference is non-deterministic model execution. Query and Inference carry no additional call key; their execution metadata provides correlation.
_Avoid_: Arbitrary operation type, node kind

**Workflow Deployment Capability**:
An environment-level declaration that a Runtime-supported event source or business operation is intentionally connected and enabled for production use. It is independent of transient service health and tenant-specific Product Entitlement.
_Avoid_: Runtime Support, tenant allowlist, health check

**Workflow Production Availability**:
The effective permission to publish, enable, or progress a Workflow capability after intersecting its Workflow Capability Profile, Workflow Runtime Support, Workflow Deployment Capability, Product Entitlement, and required business resources.
_Avoid_: Runtime whitelist, node visibility

**Workflow Capability Requirement**:
A versioned event-source or business-operation dependency frozen into a Workflow Revision by compilation. Production Availability requires the current environment to provide every Capability Requirement used by that Revision.
_Avoid_: Current deployment status, tenant entitlement

**Workflow Revision**:
An immutable published execution snapshot of a Workflow's graph, node configuration, and Capability Requirements.
_Avoid_: Mutable current graph, Run lifetime version

**Workflow Run**:
The durable journey of one Workflow Subject through a Workflow. An active Run has exactly one current Task; completed nodes are never replayed after a newer Revision is published.
_Avoid_: Revision instance, event delivery

**Workflow Task**:
The scheduling unit for one node visit on a Run. Creating a Task is Node Arrival and pins that visit's Node ID, Node Kind, Revision, and configuration until the node completes or is cancelled.
_Avoid_: MQ message, whole Workflow Run

**Node Arrival**:
The creation of the current Task for a node. From that moment the visit is pinned to that Task's Revision and configuration, independent of when a Worker later executes it.
_Avoid_: Worker pickup, execution start

**Workflow Live Revision Routing**:
The rule that a Run finishes the current node on its pinned Revision, then resolves the next node from the latest published Revision. If the latest published graph cannot continue safely, the Run takes a Flow Changed Exit.
_Avoid_: Hot-swapping the current node, migrating all in-flight Runs at publish time

**Flow Changed Exit**:
A non-fault unfinished outcome used when a newly published graph or required context no longer offers a safe next node for an in-progress Run.
_Avoid_: Runtime failure, automatic compensation

**Workflow Node ID**:
The stable runtime identity of a node across Revisions. Changing title, configuration, or edges does not change it; deleting and recreating a node must mint a new ID.
_Avoid_: Display title, array index

**Source Outlet ID**:
The stable identity of a node's execution exit across Revisions, including Branch Path IDs and AI Intent IDs. Deleting and recreating an exit must mint a new ID.
_Avoid_: Display label, array index

**Product Entitlement**:
A tenant's purchased or enabled product capability. It controls commercial access independently from the semantic boundaries of a Workflow Type.
_Avoid_: Workflow Type

**Workflow Entitlement Suspension**:
A recoverable system pause applied when Java reports that a tenant no longer has the Product Entitlement for a Workflow Type. It blocks new work without immediately making the Workflow terminal; prolonged loss may later cause a permanent stop at the next execution boundary.
_Avoid_: User pause, immediate stop

**Workflow Entry Event**:
A versioned business fact produced by Java that may start or wake zero or more Workflows. It carries the source identities and available Subject references of the business fact, but never names a target Workflow, Workflow Type, Revision, or Run. Each matched Binding resolves exactly one Subject before creating or waking a Run.
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
