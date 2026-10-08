# Spellbook client, recognition and sorter research

- Status: Research and decision support; not an accepted architecture
- Last Reviewed: 2026-10-08
- Source of Truth: linked primary sources, current repository code and explicitly identified engineering assessments
- Update Triggers: platform/runtime support, client responsibilities, reference-data use, hardware experiments, recognition measurements, distribution and operating model
- Related Docs: [Product specification](../product/specification.md), [Clients and Scan](../architecture/mobile-and-scan.md), [Sorter concept](./card-robot.md), [Application contract](../architecture/application-contract.md), [Deployment](../operations/deployment.md), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), [Domain glossary](../../GLOSSARY.md), [Integrations index](./README.md)

## Research recommendation

Spellbook should start with a shared product foundation for the website and phone. Dashboard, Catalog, Inventory and Deck Builder need the same domain rules and backend use cases. Camera capture and recognition add capabilities to those clients. A separate native app becomes worthwhile when specific camera, inference or device requirements justify its additional implementation. This is an engineering recommendation, not a selected technology.

Use the existing Jetson as the compute host for the first sorter comparison. Separating the compute host from the device controller could help open-source maintenance and reproducible builds. Recognition could later run on different hardware while the controller handles sensors and movement sequences. Direct Jetson control remains a comparison option. An additional controller must earn its complexity through measured timing or hardware replacement requirements.

The phone should initially handle login, operation and status, as the maintainer described. A phone as the compute host deserves investigation but is not yet a proven Jetson replacement. Camera mounting, device connections, app interruption and heat matter more than the ability to execute a model alone.

Revisit browser scanning. Browser cameras and local inference are documented capabilities, but their combination with a particular MTG model on the intended devices remains unproven. The retained upload/review route offers a possible fallback. Scan UI development and navigation entrypoints are currently paused. [Media Capture](https://www.w3.org/TR/mediacapture-streams/), [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/).

For self-hosting, use an ordinary Account/Inventory server without a required GPU. Treat recognition-reference production as a separate build process. Managing cards and Decks should not require every operator to maintain an ML toolchain. Permission to redistribute finished reference packages remains a separate open question.

## Starting point and research limits

Primary documentation and official source repositories were reviewed on 2026-10-07. The repository assessment was refreshed on 2026-10-08 against `main` commit `d43c636aa3ade427c965661fca1f27bcdd112f44`. This report considers development, open-source maintenance, operation, self-hosting, hardware reproduction, use and the possible university project. Recommendations are inferences from those sources. This research performed no camera, model, phone or actuator tests and bought no hardware or installed software. The maintainer's separate local hardware tests and 3D prototypes have no recorded measurements in this report.

The repository has a SvelteKit website, shared backend application modules, JSON-safe contracts and Scan upload/review APIs. Backend owns database resources, transactions and Scan orchestration; frontend composition exposes application operations and named transport helpers rather than database handles. Category rules, optional local Commander Spellbook matching, market references and Inventory value history are implemented. These capabilities establish no camera or recognition evidence. The [application contract](../architecture/application-contract.md) owns implementation status and remaining client work.

Scan UI development is paused. Navigation, Inventory and Dashboard no longer expose Scan entrypoints, but the authenticated `/mtg/scan` route, sessions, backend contracts and API remain. The [Scan worker](../../scan-worker/src/scan_worker/main.py) still returns `no_match` and `stub-v1`; productive recognition is absent. A separate phone client, machine credentials and physical box/placement management are not implemented. Existing UI Boxes are Inventory groups, not physical copy locations. [Clients and Scan](../architecture/mobile-and-scan.md), [Domain glossary](../../GLOSSARY.md).

The phone app should cover the website's product functions. During sorting, its primary role is login and operation. Browser scanning and a phone compute host remain open options. Recognition on user images should stay local, so server inference is not an active recommendation. The server may prepare public references. Job modes, duplicate-counting strategy, filter semantics and offline contracts remain open. [Current client question](https://github.com/KyleDerZweite/spellbook/issues/205), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md).

## Website and phone app

### Three reasonable client approaches

| Approach                                               | What it makes easier for Spellbook                                              | Additional work                                                                                             | When it becomes useful                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Responsive website, optionally a PWA                   | Existing product functions and UI remain usable. Browser scanning can be added. | Camera/runtime tests, install behavior, local assets and recovery. Offline functions require separate work. | The first shared product foundation and foreground scanning.           |
| Shared web UI with a native wrapper, such as Capacitor | Svelte/TypeScript UI can be reused and native capabilities added.               | API adapters, native projects, plugins, platform tests and separate releases.                               | Specific camera or accessory requirements exceed browser capabilities. |
| Separate native app                                    | Direct access to platform cameras and native ML/accessory APIs.                 | Another UI, full feature parity, auth/sync adapters and platform releases.                                  | A proven capability requirement justifies additional maintenance.      |

This table gives qualitative engineering estimates, not development hours or an app choice. A native app may use a cross-platform framework without becoming compatible with the existing website.

Capacitor bundles web assets with `index.html`. Its `server.url` option is documented for live reload, not production. The current SvelteKit app uses server loads and form actions, which do not simply run inside a bundled local WebView. Such a client must map data access to backend contracts. UI reuse and full website parity therefore require separate evidence. [Capacitor configuration](https://capacitorjs.com/docs/config), [SvelteKit SPA](https://svelte.dev/docs/kit/single-page-apps), [Implemented module boundaries](../architecture/application-contract.md#module-ownership).

First identify missing functions at the shared interface. Calling something an app should not predetermine a PWA, wrapper or separate UI. Reusing domain rules and result types helps even when capture and inference adapters differ.

### What browser scanning means

`getUserMedia()` captures a local camera stream after user permission. It neither uploads images automatically nor recognizes cards. Camera access requires a Secure Context. The special treatment of `localhost` does not generally extend to private LAN addresses. A self-hoster opening `http://192.168.x.x` on a phone therefore needs a suitable HTTPS and trust path for browser camera access. [Media Capture](https://www.w3.org/TR/mediacapture-streams/), [Secure Contexts](https://www.w3.org/TR/secure-contexts/).

ONNX Runtime Web provides CPU inference through WASM and acceleration through WebGPU. GPU providers support only some operators; WASM multithreading also depends on Cross-Origin Isolation. Test the model, operators, deployment headers and memory together. An `.onnx` export alone does not establish portability. [ORT Web](https://onnxruntime.ai/docs/tutorials/web/), [Threads and workers](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html).

The sources reviewed on 2026-10-07 disagree on Safari support. WebKit documents WebGPU in Safari 26.0 on iOS/iPadOS and mentions ONNX Runtime. The ORT compatibility table reviewed that day still marked Safari unsupported. This discrepancy establishes neither success nor failure for our model. Test specific versions and devices. [WebKit, 2025-09-15](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [ORT compatibility table](https://onnxruntime.ai/docs/get-started/with-javascript/web.html).

Browsers can freeze or discard pages. Screen Wake Lock depends on document state. An installed PWA therefore cannot promise a continuously running sorter process after an app switch or screen lock. That limit may be acceptable for occasional foreground scanning; a phone compute host needs an explicit operating contract. [Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [Screen Wake Lock](https://www.w3.org/TR/screen-wake-lock/).

### When native capabilities matter

CameraX provides Android image analysis; AVFoundation provides native capture and frame processing on Apple platforms. The Capacitor Camera plugin documents photo actions, but does not establish a suitable continuous frame analyzer for our sorter. A wrapper could add one through a dedicated native adapter. [CameraX](https://developer.android.com/media/camera/camerax/analyze), [AVFoundation](https://developer.apple.com/documentation/avfoundation/capture-setup), [Capacitor Camera](https://capacitorjs.com/docs/apis/camera).

Native inference could use ORT Mobile with CPU/XNNPACK or CoreML. Acceleration depends on operators and graph partitioning. Android NNAPI is deprecated since Android 15, so a new solution should account for its documented migration path. These facts justify comparison, not an early framework selection. [ORT Mobile](https://onnxruntime.ai/docs/tutorials/mobile/), [CoreML provider](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html), [Android NNAPI migration](https://developer.android.com/ndk/guides/neuralnetworks/migration-guide).

Native apps also have lifecycle limits. Android documents camera foreground-service requirements. Apple documents camera interruption when an app enters the background. Newer BackgroundTasks for longer compute jobs do not prove continued camera access or timely mechanical decisions. [Android service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [Apple camera interruption](https://developer.apple.com/documentation/avfoundation/avcapturesession/interruptionreason/videodevicenotavailableinbackground), [Apple BackgroundTasks](https://developer.apple.com/documentation/BackgroundTasks/performing-long-running-tasks-on-ios-and-ipados).

## Sorter computation and control

### Options to compare

| Option                                        | Benefits for this project                                                                                | Costs and missing evidence                                                       | Assessment                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Jetson recognition and direct control         | Uses existing hardware with fewer process/protocol boundaries.                                           | Test pinmux, actuator drivers and response times under camera/inference load.    | A valid simple comparison without real-time promises.                 |
| Jetson host plus MCU/controller               | Compute and movement can be investigated separately.                                                     | Adds firmware, flashing and a correlated command/result contract.                | Preferred prototype comparison for a reproducible system.             |
| Replaceable laptop/Linux host plus controller | Contributors can develop recognition and simulation without a Jetson; replacement hosts remain possible. | Test each host's camera, runtime and deadline.                                   | Useful design direction, starting with the existing Jetson.           |
| Phone host plus controller                    | An existing phone could provide camera, recognition and UI.                                              | Mounting, camera attachment, power, connection and lifecycle vary substantially. | A bounded feasibility test, not an initial default build requirement. |

A host executes capture, recognition or job planning. A controller owns sensor processing and actuator sequences. An MCU is one possible controller implementation. This report selects no boards, motors or drivers.

NVIDIA documents DevKit USB host ports, GPIO and camera connectors. Jetson.GPIO supports hardware PWM on suitable pins but does not configure pinmux itself. These capabilities prove neither sufficient channels for this construction nor a response deadline. Linux scheduling and `PREEMPT_RT` also need evaluation under the actual load. [DevKit connectors](https://docs.nvidia.com/jetson/orin-nano-devkit/user-guide/latest/hardware_layout.html), [Jetson.GPIO](https://github.com/NVIDIA/jetson-gpio#11-pwm), [Linux real-time model](https://docs.kernel.org/core-api/real-time/theory.html).

The proposed host/controller interface would be small. A local host supplies a timely routing destination with a correlated capture ID; the controller handles sensors and movement. Command acceptance, completed movement and observed card arrival remain separate reports. An MCU also needs verified firmware and suitable sensors. This separation is a recommendation, not a finished device contract. [Zephyr scheduling](https://docs.zephyrproject.org/latest/kernel/services/scheduling/index.html), [Current recovery concept](./card-robot.md#state-inventory-and-recovery).

Klipper is an open-source example of separate host/MCU responsibilities. Its documentation explains host and microcontroller processing. The analogy suggests a maintainable approach but does not transfer printer mechanics or Klipper's timing evidence to MTG cards. [Klipper code overview](https://www.klipper3d.org/Code_Overview.html).

### A phone host needs more than a model test

Consider two capture setups separately. A mounted phone could use its own camera. Using the existing webcam would also require camera access and image transport to the phone. Android USB host support depends on the device and does not establish a UVC driver. Apple's documented external UVC camera path concerns iPadOS and does not establish generic iPhone webcam access. [Android USB Host](https://developer.android.com/develop/connectivity/usb/host), [Apple external cameras](https://developer.apple.com/videos/play/wwdc2023/10106/).

Controller connections and camera connections are separate concerns. WebUSB protects video interfaces among others and is not a universal USB camera API. Compatibility data reviewed on 2026-10-07 marked Web Bluetooth and WebUSB unsupported in Safari, including iOS, and Firefox. Android WebView also does not provide a working replacement for Chrome here. Native plugins or local networking are alternatives with their own requirements. [WebUSB specification](https://usb.spec.whatwg.org/#protected-interface-class), [Bluetooth compatibility](https://github.com/mdn/browser-compat-data/blob/main/api/Bluetooth.json), [USB compatibility](https://github.com/mdn/browser-compat-data/blob/main/api/USB.json).

USB/Serial appears suitable for an initial host/controller comparison within one enclosure. Zephyr warns that populated CDC ACM TX/RX buffers establish neither delivery nor a live connection. A device protocol needs its own correlation and restart rules. Local networking may simplify phone operation and status. Consider distributed individual motor pulses only after measuring their timing requirements. [Zephyr CDC ACM](https://docs.zephyrproject.org/latest/services/connectivity/usb/device_next/cdc_acm.html).

The following cost assessment is an inference. A phone host may save compute hardware but adds support for phones, mounts, charging, operating systems and connections. An autonomous Jetson host needs more hardware but reduces dependence on a personal phone during a job. An old laptop may be an inexpensive test host; sufficient throughput remains unproven.

### Jetson is test hardware, not a universal compatibility promise

On 2026-10-07, NVIDIA listed JetPack 7.2.1 with Jetson Linux 39.2.1, CUDA 13.2.2 and TensorRT 10.16.2, including the Orin family. The ORT TensorRT page showed an older compatibility table through ORT 1.22, TensorRT 10.9 and CUDA 12.8. These tables do not validate the newer combination. Do not treat older tutorials as tested installation recipes. [JetPack downloads](https://developer.nvidia.com/embedded/jetpack/downloads), [ORT TensorRT](https://onnxruntime.ai/docs/execution-providers/TensorRT-ExecutionProvider.html).

TensorRT engines have platform and version limits. Document a baseline model, preprocessing and test images, then verify acceleration adapters separately. A model artifact, runtime and finished engine cache are different deliverables. [TensorRT support matrix](https://docs.nvidia.com/deeplearning/tensorrt/latest/getting-started/support-matrix.html).

Tegra CPU and GPU share DRAM. The available 8 GB does not provide separate system RAM plus an additional GPU budget. Capture buffers, reference index and queue compete for that memory. NVIDIA also distinguishes DevKit and production-module availability and lifespan. Hardware builders need a documented concrete variant and possible replacement hosts rather than a blanket compatibility promise. [CUDA for Tegra](https://docs.nvidia.com/cuda/cuda-for-tegra-appnote/index.html), [Jetson FAQ](https://developer.nvidia.com/embedded/faq), [Lifecycle](https://developer.nvidia.com/embedded/lifecycle).

## Recognition, routing and Inventory

Fast/Slow separation is a reasonable scheduling idea, but its value depends on the rule. Ordinary card color and Commander color identity differ. Color identity accounts for mana symbols in rules text and the reverse face, among other facts. A frame-color classifier is insufficient. Set, printing or Deck rules may need stronger identification even in the Fast Path. Include these distinctions in the first filter comparison. [Magic rules 105 and 903.4, version 2026-09-25](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt).

For the proposed sliding scan area, measure the complete decision window: capture, frame age, preprocessing, inference, target selection, transmission and actuator lead time. Model execution time alone cannot answer whether routing is timely. For version 0 with one active card, first test a complete local recognition path as the baseline. If it misses the deadline, quantify the benefit of a specialized Fast Pipeline. This is an experiment proposal; separation remains an option.

A slower queue separates timing but adds no sustained processing capacity. If captures continuously arrive faster than processing, backlog grows. Experiments therefore need a memory bound and a rule for feeding new cards. As an illustrative estimate, 100,000 vectors containing 512 `float32` values each occupy about 195 MiB before images, metadata, search index and runtime. This is not a measured Spellbook catalog or selected encoder.

Compare small OCR/image-matching baselines with an embedding model. Candidate recognition and exact-printing verification are separate objectives. Shared artwork does not prove set, language or variant. Foil and condition need their own capture and evaluation material and should initially remain optional evidence. No method is selected in the [recognition proposal](../architecture/mobile-and-scan.md#proposed-recognition-pipeline).

Compute-host selection does not solve duplicate counting. Current [Inventory data](../../backend/src/db/schema.ts) groups quantities by printing, finish and condition. [Scan commit logic](../../backend/src/scan/commit.ts) protects authorized software retries, but cannot establish whether a presented physical card was already owned. Capture ID, content and permanent physical-copy identity differ. [Glossary](../../GLOSSARY.md).

In an arbitrary mixed stack, owned and new copies of the same printing can look identical to recognition. Without additional information, their Inventory effect is ambiguous. Selecting a source box may help but remains optional under the requirement. Markings, experimental image fingerprints, user clarification and quantity reconciliation are different possible approaches. Reliability is unproven and modes remain open. Backend contracts must represent this uncertainty even when recognition runs entirely locally.

Box availability does not confirm arrival. Intentionally obscured QR codes provide a proposed routing-availability signal. A full box, an unreadable QR and actual card arrival need further observations. Show uncertain placement rather than inventing an exact storage location. [Box and placement concept](./card-robot.md#box-identity-and-availability).

## Related projects as examples

Mault describes a webcam, local browser models, server similarity search and MCU routing over Serial. It also documents calibration and construction. This makes browser inference a concrete example for the domain. Its server search, optional server inference and capture after mechanical stopping do not transfer unchanged to Spellbook's direction. Software is listed as MIT and 3D models separately as CC BY-NC-SA 4.0. The README illustrates architecture and documentation, not independently reproduced performance. [Mault](https://github.com/maultxyz/mault).

Moss Machine describes local image recognition in Python and Arduino communication, showing another host/controller approach with different mechanics. Reported scan times were not measured here. Use such projects to study failure cases, calibration UX and build guides. Reusing particular code or designs requires separate code/license review. [Moss Machine](https://github.com/KairiCollections/Moss-Machines-Magic-the-Gathering-sorting).

## Reference data, open source and operation

### Local recognition redistributes work

Current [deployment](../operations/deployment.md#services-and-startup) requires no recognition GPU. The Catalog worker imports metadata and image URLs, not a complete image collection. The [bulk importer](../../worker/src/worker/bulk.py) supports JSON arrays and JSONL; the [Scryfall client](../../worker/src/worker/scryfall.py) handles compressed downloads. Public price, Oracle Tags and optional Combo publication are also implemented. None of these provides a finished embedding or local recognition-index build.

Scryfall documentation reviewed on 2026-10-07 described daily bulk exports as `jsonl.gz`. Rate limits differ by endpoint; bulk data and local caching are recommended for large numbers of lookups or image resolutions. Build from a coherent snapshot rather than performing an API lookup for each presented card. Image downloads, embedding computation and resumable builds remain additional work. [Bulk data](https://scryfall.com/docs/api/bulk-data), [Rate limits](https://scryfall.com/docs/api/rate-limits).

| Delivery approach                   | Who bears build work?              | Benefit                                                     | Open question                                                     |
| ----------------------------------- | ---------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Project supplies reference packages | Maintainer or dedicated build host | Small self-hosts can import packages.                       | Redistribution rights, distribution, versioning and availability. |
| Each self-host builds references    | Operator                           | Control over sources and model version.                     | Toolchain, download volume, build time and hardware requirements. |
| Import plus optional local build    | Both paths are available           | Operation can continue if public builds become unavailable. | Two reproducible paths using the same package contract.           |

Investigate import and local build without requiring a GPU build on every backend. A central build may supply local clients without requiring a central user account or an ongoing startup dependency. Maintaining both paths immediately depends on the first model and actual build cost.

A reference package should connect model/preprocessing version, Catalog snapshot, printing/face mapping, data format and compatible clients. Validate an update completely before replacing the active version. A digest establishes integrity, but without trusted provenance it does not establish the publisher. TUF provides an established update-trust model as a design example, not a version 0 dependency recommendation. [TUF specification](https://theupdateframework.github.io/specification/latest/).

### Code licenses do not establish image or model-weight rights

Spellbook uses [AGPLv3](../../LICENSE). Its modified network version and binary distribution rules belong in release planning; they grant no rights to external card images or ML checkpoints. Assess model code, weights, training data, reference images and derived indexes separately. ONNX Runtime's MIT license covers the runtime, not every model it executes. [AGPLv3, especially sections 6 and 13](https://www.gnu.org/licenses/agpl-3.0.html), [ORT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE), [Model-card contents](https://huggingface.co/docs/hub/model-cards).

Scryfall identifies additional MTG software and research as uses, requires value beyond simple republication, and governs free data access and image display. Its documentation does not settle redistribution of every recognition index or internal preprocessing method. Full image downloads, normalized references and embeddings are therefore not cleared deliverables merely because the sources are public. Clarify the intended use before publication. [Scryfall API usage](https://scryfall.com/docs/api).

Wizards has its own Fan Content Policy. Free downloads and open code do not jointly grant blanket rights to arbitrary card-image packages. Prefer a small model/data combination with documented rights before planning a large public mirror. This report makes no legal classification of embeddings. [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).

### Self-hosting must work as a user workflow

A phone client needs selectable Spellbook instances and compatible auth/API contracts. Test HTTPS, local name resolution, certificate trust and device connections on a fresh self-host. Native packaging changes these questions. Apple ATS has its own networking rules, and local communication may need additional user permission. A wrapper does not automatically simplify LAN use. [Apple ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections), [Local Network Privacy](https://developer.apple.com/videos/play/wwdc2020/10110/).

RFC 8628 offers a comparison for the desired QR login through second-device authorization with short-lived codes. It requires neither OAuth nor an external identity provider for Spellbook. The actual contract must bind instance, machine, account and permitted actions. Device authorization and later offline operation are separate tasks. [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628.html), [Existing local authentication](../operations/local-auth.md).

Distinguish at least four offline cases: temporary backend failure, lost phone connection, offline recognition with installed references, and fresh installation without internet. These are different user promises. A local queue may retain results, but Inventory changes after later sync still require conflict, authorization and replay rules.

Backups must cover private Account/Inventory/Deck data and required uploads. Upload bytes currently live outside PostgreSQL. References are easily rebuildable only while sources and toolchains remain available. Test restore with an existing reference package and treat rebuilding it as a separate capability. [Spellbook storage](../operations/deployment.md#storage-and-upgrades), [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html).

### App distribution and reproducible hardware builds

Android documents APK distribution and signing. Developer-verification rules reviewed on 2026-10-07 also change conditions by region. Open-source users need a documented build/update path; an indefinite promise of account-free installation on every device would be unsupported. [Alternative distribution](https://developer.android.com/distribute/marketing-tools/alternative-distribution), [App signing](https://developer.android.com/studio/publish/app-signing), [Developer verification](https://developer.android.com/developer-verification).

Apple Personal Team provisioning expires after seven days. App Review requires value beyond a repackaged website, and alternative EU distribution has separate conditions. An iOS app adds distribution and release work. Store compatibility of the app content and license has not been assessed. A functional web version preserves access when a native release is unavailable. [Apple account options](https://developer.apple.com/help/account/basics/about-your-developer-account), [App Review section 4.2](https://developer.apple.com/app-store/review/guidelines/), [EU Web Distribution](https://developer.apple.com/support/web-distribution-eu/).

Hardware reproduction needs more than a source repository. A published build should connect CAD/BOM revision, pin mapping, firmware, host version, model package and calibration. Explicitly test component variants. The existing DevKit reference build and future replacement hosts are different promises. Klipper's installation guide illustrates the board-specific build, flash and configuration work that remains in an open host/MCU design. [Klipper installation](https://www.klipper3d.org/Installation.html).

## Assessment by perspective

This matrix contains engineering inferences from the findings, not quantitative cost or quality measurements.

| Perspective                              | What helps                                                                                   | What adds cost or fragility                                                                      | First-step consequence                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Developers                               | Shared product functions, backend rules and test cases; separate capture/inference adapters. | Two complete UIs and several unmeasured ML paths at once.                                        | Test small browser/phone capabilities and keep parity visible.                           |
| Open-source maintainers and contributors | CPU reference runs, replay files, documented interfaces and reproducible variants.           | Every contribution requires a Jetson, mechanics or a specific personal phone.                    | Make simulator and data contracts usable without hardware; keep bench evidence separate. |
| Shared-service operators                 | No server inference on user images; bounded result and asset handling.                       | Underestimated public package builds, bandwidth, storage and version support.                    | Assess Account service, reference builds and distribution separately.                    |
| Self-hosters                             | Own accounts, instance selection, package import and a clear HTTPS/restore path.             | GPU requirements, a mandatory central account, opaque image downloads and app/backend conflicts. | Test a fresh small host and real phone as one user workflow.                             |
| Hardware builders                        | A verified build with calibration, diagnostics and replacement parts.                        | Untested components called compatible; software status replacing sensor observations.            | Document one reproducible reference build before extending variants.                     |
| Card owners                              | Complete phone product functions, understandable clarification and correctable results.      | Wrong printing/condition, duplicate counts and invented box positions.                           | Show recognition, arrival and confirmed ownership separately.                            |
| University project                       | Measurable connection between sensors, state machine, communication and application.         | Success judged only by a polished simulation or ML demo.                                         | Use bench and integration experiments with bounded, checkable questions.                 |

An autonomous sorter may let owners use their phone elsewhere after job start, if the eventual contract supports it. A phone host may suit a cheaper specialized build but requires supported operation throughout the run. Both are possible products with different support promises.

## Small experiments before an architecture choice

These experiments are proposals and were not performed in this research. Their order makes expensive choices depend on missing evidence.

| Experiment                                        | Bounded question                             | Record                                                                                                                        | Decision it informs                                                     |
| ------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Capture on the existing Jetson and real phones | Are frames usable for our cards?             | Camera/OS version, motion or stopping, lighting, exposure, frame age, blur and occlusion.                                     | Scan area, camera access and required capture aids.                     |
| 2. Small recognition comparison                   | Can relevant hosts run the same task?        | Selected printings, runtime/model digest, preprocessing, cold start, p50/p95/p99 latency, memory, errors and rejection.       | Browser, wrapper/native and Jetson acceleration based on real evidence. |
| 3. Controller under load and disconnect           | Is movement unambiguous and timely?          | Sensor event to actual output, host load, missed deadlines, command replay, restart and unknown position.                     | Direct control versus host/controller separation.                       |
| 4. Longer phone-host run                          | Does the complete capture/routing path work? | Charging, heat, app switch, screen lock, process exit, camera/controller connection and active-card behavior.                 | Whether and under what conditions to support the phone host.            |
| 5. Small reference package and fresh self-host    | Can users install and restore it?            | Package rights, build time, download/RAM/storage, HTTPS, instance choice, interrupted update and restore.                     | Build-work distribution and resource requirements.                      |
| 6. Exploratory workflow simulation                | Which domain states are missing?             | Mixed stacks, rescanning, late Exact Recognition, QR loss, wrong Fast destination, queue bound and duplicate software events. | Roles, intake/re-sort modes and later integration contracts.            |

The first dataset may be small but should include shared artwork, different printings/languages, foil/nonfoil, sleeves, glare, double-faced cards and unknown cards. Initially use it to find obstacles. Accuracy claims later require a larger independent test set. Frames of the same physical card should not appear in both training and independent test evidence.

Determine scan position, transport window and actuator lead time before selecting mechanical deadlines. Evaluate false accepted printings, rejection, correction work and latency distribution together. Average runtime or maximum model confidence is insufficient. Simulator timings remain assumptions until supported by bench measurements.

## Questions for the next design step

1. Should a started sorter job generally continue without the phone? This distinguishes an operation client from a required compute host.
2. Which phone platforms and browsers need support? State complete product functionality separately from hardware/scanning capabilities.
3. Is a complete local recognition baseline enough for the first comparison, or does the measured ramp require the Fast Path? Which filters will be tested?
4. Should we investigate a concrete Jetson reference build and a replaceable host/controller contract? Direct control remains a measurable comparison.
5. Which reference-data/model combination may and should we distribute, and what work remains for self-hosters?
6. What evidence may change Inventory quantities, and how does the user clarify an arbitrary mixed stack? This remains open regardless of recognition host.

The answers can refine the product specification, client responsibilities and device contract. This report makes none of the options ready for implementation and replaces no hardware, recognition or deployment acceptance.

## Source date and unavailable evidence

Primary sources were read on 2026-10-07; repository claims were refreshed on 2026-10-08. Manufacturer documentation describes capabilities and limits, not Spellbook benchmarks. Conflicting or version-dependent claims were not treated as successful tests. Other open-source projects supplied architecture/documentation examples; their performance was not reproduced.

Scryfall blocked the web reader with HTTP 403. Official pages were additionally retrieved over HTTP with declared User-Agent and Accept headers. The usage assessment relies on their original text, not a third-party copy. The retrieved rules do not settle every redistribution right for possible artifacts.

Unknowns include exact webcam/phone models, installed JetPack version, selected encoder/OCR, real captures, movement deadline, allowed backlog and actual actuator/sensor hardware. No speed, accuracy, unit cost, battery life or general compatibility is promised. Only research and documentation checks were performed for this report.
