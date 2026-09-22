# ASAR plan assets

These assets are packaged with `ASAR-ROBOT-IMPLEMENTATION-PLAN.md` so the plan can be reviewed offline and converted to DOCX without referencing absolute paths in another repository.

## Images

- `images/asar-robot-top.jpg` — real robot top view from `presentation-studio/assets/images/22e3adf3-9b7a-4f20-9bcc-cf8312519183.jpg`.
- `images/asar-robot-sensors.jpg` — real robot/sensor view from `presentation-studio/assets/images/498fbef9-dc16-48b4-9b79-9d2a9c671d6f.jpg`.
- `images/asar-robot-side.jpg` — real robot side view from `presentation-studio/assets/images/e9b51eb7-a033-468a-aaaf-41892472ebeb.jpg`.
- `images/asar-future-vision-concept.jpg` — conceptual illustration from `presentation-studio/assets/images/482cba27-50ef-4a95-932c-4c7767f2ccb5.jpg`; it is not evidence that LiDAR/ROS 2 is implemented.

## SVG diagrams

- `svg/system-topology.svg` — current/future compute boundaries.
- `svg/complete-target-architecture.svg` — complete target Pi/ROS 2/LiDAR/camera/SLM architecture and safety boundary.
- `svg/mechanical-stack.svg` — double-deck layout, sensor placement and Mecanum/differential-drive boundary.
- `svg/hardware-wiring.svg` — power domains, signal wiring and star-ground intent.
- `svg/delivery-loop.svg` — gated implementation and learning loop.
- `svg/connection-setup.svg` — physical power, UART, network, sensor and target Pi connection order.
- `svg/deployment-flow.svg` — versioned build, bench, deployment, health gate and rollback flow.
- `svg/exploratory-test-map.svg` — safe exploratory charter, one-variable perturbation and evidence-promotion loop.

## Mermaid source graphs

- `mermaid/topology.mmd`, `lifecycle.mmd`, `handshake.mmd`, `states.mmd`, `autopilot.mmd` — verified-baseline graphs.
- `mermaid/target-ros-graph.mmd` — target ROS 2 node/topic topology.
- `mermaid/autonomy-sequence.mmd` — LiDAR/odometry/vision/Nav2/SLM command sequence.
- `mermaid/slm-safety.mmd` — edge SLM schema validation and deterministic fallback.
- `mermaid/recommended-power-tree.mmd` — suggested battery, branch-fuse, regulated-rail and star-ground hierarchy.
- `mermaid/deployment-flow.mmd` — editable deployment gates and rollback branch.
- `mermaid/exploratory-test-tree.mmd` — editable exploratory testing loop and charter examples.

The rendered `*.png` files beside the target Mermaid sources are DOCX review caches generated with the isolated Mermaid CLI/Chrome renderer; edit the `.mmd` files, then regenerate them.

The SVGs are hand-authored diagrams based on the current repository specifications and are intentionally labeled when a value is an assumption or future upgrade.
