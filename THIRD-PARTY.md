# Attribution and dependencies

Original RosterFair source, synthetic fixtures and custom SVG icons were created by **Sharon Basovich with Codex AI assistance on October 25-27, 2026**. AI assistance covered design, implementation and verification. Claude through Kiro provided bounded static review of v0.3.0; its suggestions were checked against the code and tests. Original application code is released under the [MIT license](LICENSE).

No third-party template or component was added in v0.3.0. The roster projection uses original React and CSS, retaining the established interface and runtime licenses.

Bundled examples and verification data are synthetic. No external photographs or downloaded fonts are included; the interface uses fonts installed on the device. Imported roster files may contain personal information, but the app reads them locally and does not upload them.

## Application runtime

| Package | Version | License |
| --- | --- | --- |
| React | 19.3.1 | MIT |
| React DOM | 19.3.1 | MIT |
| Scheduler | 0.28.0 | MIT |

These packages retain their own copyrights, including notices for Meta Platforms, Inc. and affiliates. Their full runtime license notices are provided in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). The application license does not replace dependency licenses.

## Development and verification tools

| Tool | Version | License | Use |
| --- | --- | --- | --- |
| Vite | 7.3.7 | MIT | Bundler and local development server |
| Vite React plugin | 5.2.0 | MIT | React build integration |
| TypeScript | 5.9.3 | Apache-2.0 | Type checking |
| ESLint | 9.39.5 | MIT | Source lint |
| Playwright Test | 1.64.1 | Apache-2.0 | Browser tests |
| axe-core / axe-core Playwright integration | 4.14.0 | MPL-2.0 | Development-only accessibility checks |
| tsx | 4.23.15 | MIT | TypeScript test execution |

The versions above were read from installed package metadata for this release. `package.json` and `package-lock.json` describe the dependency graph used to build from source. This table is a summary of selected direct tools and runtime packages, not a claim that all transitive dependencies share one license. Each dependency retains the license and copyright notices supplied with its package. The development-only axe packages are not imported into the application runtime.

Node.js is a separately installed local runtime. Google Chrome is a separately installed browser used for verification. Neither is bundled in the release ZIP. No paid service or external API is required to run RosterFair.

