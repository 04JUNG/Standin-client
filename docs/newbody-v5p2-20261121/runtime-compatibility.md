# SSR2 reader compatibility and rollout

The candidate reader adds the explicit selection modes `idw2-varying`,
`idw2-varying-trilinear`, and `idw2-varying-multilinear`. The first excludes controls whose preset defaults are
identical from distance calculation; every control still affects geometry.
The second also evaluates measured three-control residual tables. The third
also supports four-control tables by interpolating their sixteen corners. A
direct four-control displacement table can replace lower-order terms wholly
contained in that block; overlapping terms must not be counted twice. Legacy `idw2`
selection and runtimes without selection metadata keep their existing behavior.

An axis or pair dimension can contain at most 256 nodes. A three-control term
requires three distinct known controls, increasing grids of 2–32 nodes, and a
complete coefficient range inside the verified payload. Each model permits at
most eight three-control terms. Four-control terms require four distinct known
controls, increasing grids of 2–16 nodes, and a complete coefficient range.
Each model permits at most four four-control terms. Three-control tables
require the trilinear or multilinear mode; four-control tables require the
multilinear mode. Undeclared tables are rejected. The 32 MiB file limit, source/SHA identity, finite values, vertex
and index validation remain mandatory.

The multilinear mode may declare bounded, distinct known `distanceKeys` that
separate every preset center. These dimensions select the body family; all
controls still affect geometry. Legacy modes reject this override. The candidate
uses core body controls so height, leg and detail adjustments cannot inflate
unrelated family distances.

The offline reducer removes only original table knots and retains all preset
knots. Its coefficient norm certificate bounds the total geometry change to
0.05 mm per model before PCA. Compression weights complete single-control axis
blocks more heavily to protect their stricter few-control error budget. These
training operations never replace final full-precision controller checks.

Older readers reject the new mode. A successful build or a local candidate file
does not make the new catalog compatible with clients already in production.
The compatible client must be reviewed, released, and available before any
catalog containing the new mode is activated. This task does not publish that
client release or change the production update feed. The main-target client PR
must include this reader change; staging-only delivery changes are separate.

Before activation, verify the exact final runtime bytes with this reader and
the independent full-catalog controller checks. A rejected or missing preview
runtime must never be presented as an accurate slider result. Authoritative
Converter output and its file/identity checks remain separate gates.

Rollback restores the previous immutable catalog pin and aliases while keeping
both asset generations and existing saved cards/history. Compatible readers
continue reading the legacy format. Do not rewrite the contents of an existing
character ID or transfer approval flags between models.
