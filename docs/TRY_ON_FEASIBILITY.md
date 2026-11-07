# Worn-garment preview: requirements and feasibility

Updated 2026-11-07. **Gate result: not passed.** No reviewed implementation currently establishes the full requirement set on the target machine. This is a source/compatibility assessment, not a measured M5 inference benchmark or a proof that the target is impossible.

## Accepted user brief

The user confirmed these decisions in the Q1–Q13 interview:

- Accept both garment-only product photos and photos of another person wearing the garment. Prepare the uploaded item automatically without manual body or garment calibration.
- Replace the clothing already visible on the wearer, including loose clothing that extends beyond the replacement garment. Merely adding another image over it does not pass.
- Align the neckline/collar, shoulders, chest, and waist; preserve the uploaded garment's intended sleeve length. Short sleeves cover the appropriate upper-arm region; long sleeves follow elbows to wrists.
- Track seated and standing front-facing poses, slight movement, raised/bent arms, and hands crossing the chest. Hands and exposed forearms must appear in front of clothing where appropriate. Side/back views are deferred.
- Hips need not be in view. Require shoulders, elbows, and wrists to be visible when their corresponding garment regions need tracking; recover after temporary tracking loss.
- Processing may run in the browser or on the same computer. No external inference or transmission of user imagery to third parties is accepted.
- After a one-time local model download/setup, garment preparation must take 3–5 seconds once the garment and camera inputs are ready. Target live output is 24–30 newly processed frames per second; replaying old/generated frames at that display rate does not qualify.
- Plain missing fabric may be reconstructed plausibly. Flag or reject cases that would require inventing logos, text, patterns, or garment structure.
- First prove one prepared shirt end to end, including replacing existing clothes and arm/hand interactions, before expanding supported inputs. If requirements cannot be established, report the failure before expanding implementation or silently reducing quality/speed.

## Local evidence and implementation gap

Read-only hardware inspection returned Apple M5, arm64, and 17,179,869,184 bytes (16 GiB) memory. The checkout remains a React/Vite/TypeScript app with MediaPipe pose tracking and Canvas garment warping. There is no local generative replacement model or service in its package manifest.

The current warp uses shoulder/hip-derived targets, elbow-driven sleeve controls, interpolated waist/neckline controls, and a heuristic foreground head/hand/crossed-forearm mask. It still has no model that removes existing clothes and reconstructs newly exposed regions. A green tracking guide and an intact shirt silhouette do not establish that the user looks dressed in the selected garment. Sleeve coverage and arm occlusion remain unverified across representative live poses.

## Candidate assessment

| Candidate | Verified behavior or restriction | Result for this brief |
| --- | --- | --- |
| [Drakit0/Try-On](https://github.com/Drakit0/Try-On) | Local pose, smoothing, garment-specific control points/TPS and optional occlusion. Prepared garment metadata is part of the design. | Useful geometry reference; not evidence of arbitrary-photo extraction and replacement of existing loose clothes. |
| [RTV](https://github.com/ZaiqiangWu/RTV) | README requires a dedicated network per garment and explicitly says it overlays synthesized clothing without removing original clothing. | Fails immediate arbitrary uploads and existing-clothing replacement. |
| [FASHN VTON v1.5](https://github.com/fashn-AI/fashn-vton-1.5) | Image-to-image synthesis accepts flat-lay and model-worn inputs. [Authors' research page](https://fashn.ai/research/vton-1-5) reports roughly 5-second H100 inference and notes incomplete garment removal in some transitions. | Relevant quality baseline; does not establish live video speed or complete clothing replacement. An H100 timing is not an M5 timing. |
| [FASHN Apple support PR #6](https://github.com/fashn-AI/fashn-vton-1.5/pull/6) | Open PR reports 167.686-second sampling for a 30-step run on M4 Max. The author explicitly excluded the human parser from that downstream validation. | Reported timing is not our measurement, not this M5, and not an end-to-end success. No evidence for the live target. |
| [LiveVVT](https://github.com/caoyushe/LiveVVT) | Repository says implementation is under preparation. Its [paper](https://arxiv.org/abs/2608.26714) reports 22.39 FPS at 512×384 with 1.56-second first-chunk latency. | No released implementation/checkpoint to benchmark here; paper results do not establish Apple support or 24–30 FPS on this machine. |

Repository licenses alone do not clear a complete pipeline: code, checkpoints, parsers, pose models, and garment assets need separate review before commercial use. None of the candidates is approved for integration by this document.

## Gate outcome and next evidence needed

No full pipeline was installed, downloaded, benchmarked, or connected to user imagery during this assessment. No camera was started. The quality gate fails for the current application by code inspection; the requested local latency and throughput remain unverified for a qualifying replacement model. Do not describe these as measured performance failures on the M5.

Resume integration only after identifying a released model/pipeline with compatible local execution and component terms. Then benchmark the complete path with authorized or suitably licensed inputs: initial preparation, per-frame processing, temporal garment consistency, neckline/sleeve placement, crossing-hand occlusion, and replacement of loose existing clothes. Capture numeric timings and non-image pass/fail notes; do not persist user imagery. A fast pose detector, a successful build, or a generated still image alone does not pass this gate.

No output resolution has been accepted yet. Any future timing report must state camera and output resolution, model settings, precision, device, and whether acquisition/preprocessing/postprocessing are included; low-resolution inference cannot silently stand in for the intended preview quality.
