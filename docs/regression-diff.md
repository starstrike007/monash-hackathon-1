# Fresh local regression audit

This audit began as a local comparison of the fresh rules-only submissions from `main` and `overnight/phase-8` while the evaluator path was unavailable. The two submissions had 19 differing email records. After the replacement scorer path was supplied, the final candidate score was verified equal to `main` and `phase8-document-parsers` and higher than `overnight/phase-8`. For comparison rows below, only fields involved in the changed defect set are shown; the other canonical fields were unchanged or did not affect the reported difference. Values and snippets are truncated to keep the log from reproducing full documents.

Format pairing is SI extension + BL extension. Locations are taken from the parser evidence attached to each field.

## Changed records

### `email_055` — `.xlsx + .docx`

`OK / null / false / []` -> `MISMATCH / null / true / [shipper, consignee, notify_party]`.

- `shipper`: SI raw/norm `APRIL FINE PAPER TRADING` / `APRIL FINE PAPER TRADING`; BL raw/norm `APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PTE LTD 77 ROBINSON ROAD, #21-01 SINGAPORE 068896` / `APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PRIVATE LIMITED 77 ROBINSON ROAD #21-01 SINGAPORE 068896`. SI evidence: `attachments/email_055_SI.xlsx`, sheet `S.I.`, cell `A4`, `Shipper/Exporter | APRIL FINE PAPER TRADING | ...`; BL evidence: `attachments/email_055_BL.docx`, cell `1`, `Shipper (Principal or Seller) ... | APRIL FINE PAPER TRADING ON BEHALF OF ...`.
- `consignee`: SI raw/norm `AL GURG STATIONERY LLC` / `AL GURG STATIONERY LLC`; BL raw/norm `AL GURG STATIONERY LLC P.O. BOX 5069 DUBAI, UNITED ARAB EMIRATES` / `AL GURG STATIONERY LLC P O BOX 5069 DUBAI UNITED ARAB EMIRATES`. SI evidence: `email_055_SI.xlsx`, sheet `S.I.`, cell `A5`, `Consignee ... | AL GURG STATIONERY LLC | P.O. BOX ...`; BL evidence: `email_055_BL.docx`, cell `1`, `Consignee ... | AL GURG STATIONERY LLC P.O. BOX ...`.
- `notify_party`: SI raw/norm `AL GURG STATIONERY LLC` / `AL GURG STATIONERY LLC`; BL raw/norm `AL GURG STATIONERY LLC P.O. BOX 5069 DUBAI, UNITED ARAB EMIRATES` / `AL GURG STATIONERY LLC P O BOX 5069 DUBAI UNITED ARAB EMIRATES`. SI evidence: `email_055_SI.xlsx`, sheet `S.I.`, cell `A6`, `NOTIFY PARTY | AL GURG STATIONERY LLC | P.O. BOX ...`; BL evidence: `email_055_BL.docx`, cell `1`, `Notify ... | AL GURG STATIONERY LLC P.O. BOX ...`.

### `email_059` — `.pdf + .pdf`

`OK / null / false / []` -> `MISMATCH / null / true / [gross_weight_kg]`.

- `gross_weight_kg`: SI raw/norm `PURJ4736471 40'HC ... 21,887` / `473647140`; BL raw/norm `GSLB0479748 40'HC ... 21,887` / `47974840`. Both SI and BL evidence are page `1` with the snippet `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`.

### `email_097` — `.xlsx + .docx`

`MISMATCH / null / true / [container_count, gross_weight_kg]` -> `MISMATCH / null / true / [consignee, container_count, gross_weight_kg]`.

- `consignee`: SI raw/norm `ROXCEL TRADING GMBH` / `ROXCEL TRADING GMBH`; BL raw/norm `ROXCEL TRADING GMBH OPERNRING 3-5 1010 VIENNA, AUSTRIA` / `ROXCEL TRADING GMBH OPERNRING 3-5 1010 VIENNA AUSTRIA`. SI evidence: `email_097_SI.xlsx`, sheet `S.I.`, cell `A5`, `Consignee ... | ROXCEL TRADING GMBH | OPERNRING ...`; BL evidence: `email_097_BL.docx`, cell `1`, `CONSIGNEE ... | ROXCEL TRADING GMBH OPERNRING ...`.

### `email_160` — `.pdf + .pdf`

`OK / null / false / []` -> `MISMATCH / null / true / [gross_weight_kg]`.

- `gross_weight_kg`: SI raw/norm `GLBV3136502 40'HC ... 23,702` / `313650240`; BL raw/norm `ZISD6300979 40'HC ... 23,702` / `630097940`. Both SI and BL evidence are page `1`, snippet `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`.

### `email_208` — `.pdf + .pdf`

`MISMATCH / null / true / [notify_party]` -> `MISMATCH / null / true / [notify_party, gross_weight_kg]`.

- `gross_weight_kg`: SI raw/norm `SXSA7726257 20'FCL ... 23,990` / `772625720`; BL raw/norm `VNIB1557788 20'FCL ... 23,990` / `155778820`. Both SI and BL evidence are page `1`, snippet `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`.

### `email_273` — `.pdf + .pdf`

`NEEDS_REVIEW / missing_value / null / []` -> `NEEDS_REVIEW / missing_value / null / [gross_weight_kg]`.

- `gross_weight_kg`: SI raw/norm `RALE9240755 20'FCL ... 20,802` / `924075520`; BL raw/norm `ZBEE5999966 20'FCL ... 20,802` / `599996620`. Both SI and BL evidence are page `1`, snippet `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`.

### `email_291` — `.xlsx + .docx`

`MISMATCH / null / true / [consignee, container_count]` -> `MISMATCH / null / true / [consignee, notify_party, container_count]`.

- `notify_party`: SI raw/norm `INTERNATIONAL FOREST PRODUCTS LLC` / `INTERNATIONAL FOREST PRODUCTS LLC`; BL raw/norm `INTERNATIONAL FOREST PRODUCTS LLC 6 HOLLIS STREET SUITE 100 FRAMINGHAM, MA 01702, USA` / `INTERNATIONAL FOREST PRODUCTS LLC 6 HOLLIS STREET SUITE 100 FRAMINGHAM MA 01702 USA`. SI evidence: `email_291_SI.xlsx`, sheet `S.I.`, cell `A6`, `Notify | INTERNATIONAL FOREST PRODUCTS LLC | 6 HOLLIS ...`; BL evidence: `email_291_BL.docx`, cell `1`, `Notify Party ... | INTERNATIONAL FOREST PRODUCTS LLC 6 HOLLIS ...`.

### `email_302` — `.xlsx + .docx`

`MISMATCH / null / true / [container_count]` -> `MISMATCH / null / true / [consignee, container_count]`.

- `consignee`: SI raw/norm `INTERNATIONAL FOREST PRODUCTS LLC` / `INTERNATIONAL FOREST PRODUCTS LLC`; BL raw/norm `INTERNATIONAL FOREST PRODUCTS LLC 6 HOLLIS STREET SUITE 100 FRAMINGHAM, MA 01702, USA` / `INTERNATIONAL FOREST PRODUCTS LLC 6 HOLLIS STREET SUITE 100 FRAMINGHAM MA 01702 USA`. SI evidence: `email_302_SI.xlsx`, sheet `S.I.`, cell `A5`, `CONSIGNEE | INTERNATIONAL FOREST PRODUCTS LLC | 6 HOLLIS ...`; BL evidence: `email_302_BL.docx`, cell `1`, `Consignee ... | INTERNATIONAL FOREST PRODUCTS LLC 6 HOLLIS ...`.

### `email_354` — `.xlsx + .docx`

`MISMATCH / null / true / [notify_party, gross_weight_kg]` -> `MISMATCH / null / true / [shipper, consignee, notify_party, gross_weight_kg]`.

- `shipper`: SI raw/norm `APRIL FINE PAPER TRADING` / `APRIL FINE PAPER TRADING`; BL raw/norm `APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PTE LTD 77 ROBINSON ROAD, #21-01 SINGAPORE 068896` / `APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PRIVATE LIMITED 77 ROBINSON ROAD #21-01 SINGAPORE 068896`. SI evidence: `email_354_SI.xlsx`, sheet `S.I.`, cell `A4`; BL evidence: `email_354_BL.docx`, cell `1`, `Shipper ... | APRIL FINE PAPER TRADING ON BEHALF OF ...`.
- `consignee`: SI raw/norm `HABRAS INTERNATIONAL LIMITED` / `HABRAS INTERNATIONAL LIMITED`; BL raw/norm `HABRAS INTERNATIONAL LIMITED OFFICE 1204 ... DUBAI, UAE` / `HABRAS INTERNATIONAL LIMITED OFFICE 1204 THE BURLINGTON TOWER BUSINESS BAY DUBAI UAE`. SI evidence: `email_354_SI.xlsx`, sheet `S.I.`, cell `A5`; BL evidence: `email_354_BL.docx`, cell `1`, `Consignee ... | HABRAS INTERNATIONAL LIMITED OFFICE ...`.
- `notify_party`: SI raw/norm `HABRAS INTERNATIONAL LIMITED` / `HABRAS INTERNATIONAL LIMITED`; BL raw/norm `NAGAPPA EXPORTS OFFICE 1204 ... DUBAI, UAE` / `NAGAPPA EXPORTS OFFICE 1204 THE BURLINGTON TOWER BUSINESS BAY DUBAI UAE`. SI evidence: `email_354_SI.xlsx`, sheet `S.I.`, cell `A6`; BL evidence: `email_354_BL.docx`, cell `1`, `NOTIFY PARTY ... | NAGAPPA EXPORTS OFFICE ...`.
- `gross_weight_kg`: SI raw/norm `20603` / `20603`; BL raw/norm `22,603` / `22603`. SI evidence: `email_354_SI.xlsx`, sheet `S.I.`, cell `A10`, `Gross Weight (KG) | 20603`; BL evidence: `email_354_BL.docx`, cell `1`, `Gross Wt (kgs) ... | 22,603`.

### `email_407` — `.pdf + .pdf`

`MISMATCH / null / true / [notify_party]` -> `MISMATCH / null / true / [notify_party, gross_weight_kg]`.

- `gross_weight_kg`: SI raw/norm `YCYV6477251 20'GP ... 23,810` / `647725120`; BL raw/norm `HWCU6704502 20'GP ... 23,810` / `670450220`. Both SI and BL evidence are page `1`, snippet `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`.

### `email_411` — `.pdf + .pdf`

`NEEDS_REVIEW / missing_value / null / []` -> `NEEDS_REVIEW / missing_value / null / [gross_weight_kg]`.

- `gross_weight_kg`: SI raw/norm `EMDX9237245 20'FCL ... 22,794` / `923724520`; BL raw/norm `BUDY4448564 20'FCL ... 22,794` / `444856420`. Both SI and BL evidence are page `1`, snippet `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`.

### `email_434` — `.pdf + .pdf`

`NEEDS_REVIEW / missing_value / null / [port_of_discharge]` -> `NEEDS_REVIEW / missing_value / null / [port_of_discharge, gross_weight_kg]`.

- `gross_weight_kg`: SI raw/norm `JMGP6604655 20'FCL ... 21,790` / `660465520`; BL raw/norm `CPLX0961701 20'FCL ... 21,790` / `96170120`. Both SI and BL evidence are page `1`, snippet `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`.

### `email_435` — `.xlsx + .docx`

`NEEDS_REVIEW / missing_value / null / [gross_weight_kg]` -> `NEEDS_REVIEW / missing_value / null / [notify_party, gross_weight_kg]`.

- `notify_party`: SI raw/norm `AL GURG STATIONERY LLC` / `AL GURG STATIONERY LLC`; BL raw/norm `AL GURG STATIONERY LLC P.O. BOX 5069 DUBAI, UNITED ARAB EMIRATES` / `AL GURG STATIONERY LLC P O BOX 5069 DUBAI UNITED ARAB EMIRATES`. SI evidence: `email_435_SI.xlsx`, sheet `S.I.`, cell `A6`; BL evidence: `email_435_BL.docx`, cell `1`, `NOTIFY PARTY ... | AL GURG STATIONERY LLC P.O. BOX ...`.
- `gross_weight_kg`: SI raw/norm `214270` / `214270`; BL raw/norm `214,770` / `214770`. SI evidence: `email_435_SI.xlsx`, sheet `S.I.`, cell `A10`, `Gross Weight (KG) | 214270`; BL evidence: `email_435_BL.docx`, cell `1`, `Gross Wt (kgs) ... | 214,770`.

### `email_462` — `.xlsx + .docx`

`OK / null / false / []` -> `MISMATCH / null / true / [shipper, consignee, notify_party]`.

- `shipper`: SI raw/norm `ASIA PACIFIC PAPERBOARD TRADING PTE LTD` / `ASIA PACIFIC PAPERBOARD TRADING PRIVATE LIMITED`; BL raw/norm `ASIA PACIFIC PAPERBOARD TRADING PTE LTD 80 RAFFLES PLACE, #50-01 UOB PLAZA 1 SINGAPORE 048624` / `ASIA PACIFIC PAPERBOARD TRADING PRIVATE LIMITED 80 RAFFLES PLACE #50-01 UOB PLAZA 1 SINGAPORE 048624`. SI evidence: `email_462_SI.xlsx`, sheet `S.I.`, cell `A4`; BL evidence: `email_462_BL.docx`, cell `1`, `Shipper ... | ASIA PACIFIC PAPERBOARD TRADING PTE LTD 80 RAFFLES ...`.
- `consignee`: SI raw/norm `3S PAPER PRODUCTS SDN BHD` / `3S PAPER PRODUCTS SENDIRIAN BHD`; BL raw/norm `3S PAPER PRODUCTS SDN BHD NO 12, JALAN INDUSTRI 3/6 ...` / `3S PAPER PRODUCTS SENDIRIAN BHD NO 12 JALAN INDUSTRI 3 6 ...`. SI evidence: `email_462_SI.xlsx`, sheet `S.I.`, cell `A5`; BL evidence: `email_462_BL.docx`, cell `1`, `CONSIGNEE ... | 3S PAPER PRODUCTS SDN BHD NO 12 ...`.
- `notify_party`: SI raw/norm `ORIENT LINKS CO (LLC)` / `ORIENT LINKS COMPANY (LLC)`; BL raw/norm `ORIENT LINKS CO (LLC) P.O. BOX 61041 JEBEL ALI, DUBAI, UAE` / `ORIENT LINKS COMPANY (LLC) P O BOX 61041 JEBEL ALI DUBAI UAE`. SI evidence: `email_462_SI.xlsx`, sheet `S.I.`, cell `A6`; BL evidence: `email_462_BL.docx`, cell `1`, `Notify ... | ORIENT LINKS CO (LLC) P.O. BOX ...`.

### Document-resolution-only differences

- `email_507` — `.txt + none`: `NEEDS_REVIEW / wrong_doc_type / null / []` -> `NEEDS_REVIEW / missing_attachment / null / []`; selected SI was `attachments/email_507_SI.txt`, with no BL candidate.
- `email_509` — `.txt + none`: `NEEDS_REVIEW / wrong_doc_type / null / []` -> `NEEDS_REVIEW / missing_attachment / null / []`; selected SI was `attachments/email_509_SI.txt`, with no BL candidate.
- `email_512`, `email_513`, `email_514` — `none + none`: each changed from `NEEDS_REVIEW / missing_attachment / null / []` to `NEEDS_REVIEW / unreadable / null / []`; no usable document field exists to report. These are document-level review outcomes, not invented comparisons.

## Pattern ranking and action

| rank | pattern | affected records | count | action |
| ---: | --- | --- | ---: | --- |
| 1 | PDF header `CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)` was treated as a gross-weight label | `059, 160, 208, 273, 407, 411, 434` plus the same extraction shape in `435` | 8 | Require label matches at the start of a line/cell; add a synthetic header regression test. |
| 2 | Multiline DOCX value cells were flattened, merging addresses into party values | `055, 097, 291, 302, 354, 435, 462` | 7 | Preserve cell-internal line boundaries; add a synthetic multiline-cell test. |
| 3 | Resolution became more conservative for one-sided, unreadable, or missing candidates | `507, 509, 512, 513, 514` | 5 | Retain explicit review routing; no dataset-specific change. |

The first two patterns are general parser/extractor defects supported by the source evidence above. They are fixed on `merge-candidate` only through general rules and synthetic tests. The document-resolution behavior remains conservative and is not tuned to these record IDs.

## Post-fix local validation

A fresh rules-only export after the two parser fixes completed with 520 entries and `run_status=complete`:

| version | OK | MISMATCH | NEEDS_REVIEW | differences from fresh `main` output |
| --- | ---: | ---: | ---: | ---: |
| `merge-candidate` | 411 | 28 | 81 | 5 document-resolution records |

The remaining records are `email_507`, `email_509`, `email_512`, `email_513`, and `email_514`. They differ only in review reason: one-sided candidates are `missing_attachment`, and unreadable candidates are `unreadable`. No parser-derived field or status difference remains in the local comparison. The supplied scorer confirms the candidate's final score is `0.5533814238`, with Stage 3 defect precision `0.9230769231` and end-to-end success `18/46`.
