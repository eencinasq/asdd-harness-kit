# Third-party notices

This project includes code and data derived from third-party open-source software. The original
copyright and license notices are reproduced below, as their licenses require.

## open-code-review

Parts of `src/pr-review/engine/` are derived from
[open-code-review](https://github.com/alibaba/open-code-review): the diff and hunk parsing, file
selection, the rule resolver, the comment line resolution, and the data in `rules/system_rules.json`,
`rules/rule_docs/*` (except `tests.md`) and `data/*.json`. These files have been modified.

Copyright 2026 alibaba/open-code-review Contributors.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in
compliance with the License. You may obtain a copy of the License at
<https://www.apache.org/licenses/LICENSE-2.0>.

Unless required by applicable law or agreed to in writing, software distributed under the License is
distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.


## security-audit-skill

`src/security/methodology/` vendors the checklists (`*.md`), `report-schema.json` and `validate-findings.cjs` of
[cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (`skills/security-audit/`, commit
`c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`). Each file carries a one-line header naming its source; otherwise the files are
unmodified. The security tools (`src/security/`) load the checklists as guidance and run the validator on submitted
findings.

MIT License

Copyright (c) 2025-2026 Cloudflare, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
