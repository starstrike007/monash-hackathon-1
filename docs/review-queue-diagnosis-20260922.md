# Review queue diagnosis — 2026-09-22

## Measurement boundary

The diagnosis uses the complete 520-row rules-only export from
`.runtime/pipeline-tuning-final2-output/submission.json` as the before state.
The OpenAI key is configured, but one tiny request with the configured
`gpt-5.6-luna` model was rejected with `BadRequestError`. No LLM-dependent fix
was attempted; all measurements below use deterministic rules.

The held-out audit is [`tests/heldout_20260922.json`](../tests/heldout_20260922.json).
It contains 20 fixed-seed candidates (`Random(20260922)`) selected from the
pre-fix `BL_COMPARISON` output after excluding [`tests/dev_set.json`](../tests/dev_set.json).
The source attachments were read and the seven fields/status were labelled by
hand. Six candidates were found to be draft-BL-only requests rather than
comparison requests; retaining them makes the held-out sample useful for
measuring the classification false-positive cause.

The fallback evaluator is `backend/evaluate_dev_set.py`; these are not official
organiser scores.

## Before and after

| Measure | Before | After |
| --- | ---: | ---: |
| Held-out composite | 0.7737 | 1.0000 |
| Held-out classification F1 | 0.8235 | 1.0000 |
| Held-out defect F1 | 1.0000 | 1.0000 |
| Held-out exact rows | 14/20 | 20/20 |
| Held-out review-handling F1 | 0.5714 | 1.0000 |
| Development-set composite | 1.0000 | 1.0000 |
| Development-set exact rows | 30/30 | 30/30 |

The least-certain held-out labels are `email_003`, `email_047`, `email_063`,
`email_350`, `email_421`, and `email_451`: their subjects contain operational
phrases such as `TO CONFIRM DOCS`, but their current message only asks for a
draft BL to be sent and never asks to compare the SI with the BL. They were
labelled `GENERAL` under the project rule that a draft-BL request without
comparison intent is not `BL_COMPARISON`. `email_300` is also worth a spot
check because its consignee is named on the SI and order-mode on the BL; the
review outcome is intentional under the order-mode policy.

## Step 1 — `missing_attachment` (29 rows)

All 29 pre-fix rows were classified by deterministic rules. None used the LLM
or a low-confidence fallback. The manual breakdown is:

| Bucket | Count | Interpretation |
| --- | ---: | --- |
| (a) genuine comparison request missing a file | 5 | Explicitly says to compare the SI and draft BL; three have no file and two have only the SI. |
| (b) non-comparison email classified as comparison | 24 | Requests that a draft BL be sent for checking, without an SI/BL comparison request. |
| (c) attachment association/read failure | 0 | No row in this reason had an attachment that the pipeline failed to associate or read. |

The five genuine cases are `email_506`, `email_507`, `email_508`, `email_509`,
and `email_510`. The two one-file cases (`email_507` and `email_509`) contain
an SI and explicitly say that the draft BL is missing. The three zero-file
cases explicitly say that attachments were dropped.

The following table records every pre-fix row. Body text is whitespace-normalized
and limited to its first 200 characters.

| ID | Bucket | Subject | First 200 body characters | Category | Method | Attachment count | Filenames |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| email_003 | b | RE_ TO CONFIRM DOCS _ 5AAT-03056 _ AQABA_JORDAN _ ROXCEL TRADING GMBH _ SIN525534192 | Dear Hari, Please assist to send the draft BL for SIN832764835 for checking asap. Thank you. Best Regards, Syed Faraz Ali Shipping Documentation DID : +971 04 4938295 APRIL Fine Paper Trading (Middle | BL_COMPARISON | rule | 0 | — |
| email_018 | b | RE_ AFPTME - SAVANNAH_US - MONTER(MCLSIN2316658) - 5RAE-69096 - 5250077054 - KPP-ANTALIS (SINGAPORE) PTE. LTD. - OA | Dear Ooi, Please assist to send the draft BL for MCLSINJEA2576036 for checking asap. Thank you. Best Regards, Elisa Tukiman Shipping Documentation DID : +971 04 4938255 APRIL Fine Paper Trading (Middl | BL_COMPARISON | rule | 0 | — |
| email_047 | b | RE_ AFRT - KOPER_SLOVENIA - PIL(SIN700541199) - 5RMY-59782 - 5250070715 - UAB NOVAKOPA - OA | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Mitchelle, Please assist to send the d | BL_COMPARISON | rule | 0 | — |
| email_050 | b | TO CONFIRM DOCS _ 5RVN-23924 _ HOCHIMINH CITY_VIETNAM _ BALL & DOGGETT AUSTRALIA PTY LTD _ SIN947383473 | Dear Ooi, Please assist to send the draft BL for SIN597746886 for checking asap. Thank you. Best Regards, Ooi Sok Yong Shipping Documentation DID : +971 04 4938218 APRIL Fine Paper Trading (Middle Eas | BL_COMPARISON | rule | 0 | — |
| email_063 | b | RE_ TO CONFIRM DOCS _ 5RUS-16571 _ BRISBANE_AUSTRALIA _ CERIEX _ SIJ4842199 | Dear Elisa, Please assist to send the draft BL for SIJ3308330 for checking asap. Thank you. Best Regards, Willy Situmorang Shipping Documentation DID : +971 04 4938283 APRIL Fine Paper Trading (Middle | BL_COMPARISON | rule | 0 | — |
| email_077 | b | RE_ AFPTME - YANGON_MYANMAR - MSC(MEDUUD392614) - 5AAT-85621 - 5250078501 - KPP-ANTALIS (SINGAPORE) PTE. LTD. - OA_CFR | Dear Arlene, Please assist to send the draft BL for MSDUL0942529396 for checking asap. Thank you. Best Regards, Mitchelle Ting Shipping Documentation DID : +971 04 4938203 APRIL Fine Paper Trading (Mi | BL_COMPARISON | rule | 0 | — |
| email_095 | b | AFEMY - TUTICORIN_INDIA - ONE(SINF41056481) - 5ALT-85079 - 5250072524 - BALL & DOGGETT AUSTRALIA PTY LTD - OA_CFR | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Hari, Please assist to send the draft  | BL_COMPARISON | rule | 0 | — |
| email_109 | b | RE_ AIE - JEBEL ALI_UAE - ONE(SINF21158693) - 5ALT-87937 - 5250074160 - CLIFFORD PAPER INC - DP | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Teo, Please assist to send the draft B | BL_COMPARISON | rule | 0 | — |
| email_141 | b | RE_ TO CONFIRM DOCS _ 5APH-77739 _ HOUSTON_US _ HABRAS INTERNATIONAL LIMITED _ SINF84322259 | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Hari, Please assist to send the draft  | BL_COMPARISON | rule | 0 | — |
| email_207 | b | AFRT - HOUSTON_US - EVER(EGLV421776253492) - 5ALT-16873 - 5250079774 - KPP-ANTALIS (SINGAPORE) PTE. LTD. - OA_CFR | Dear Teo, Please assist to send the draft BL for 070500292983 for checking asap. Thank you. Best Regards, Arlene Yamomo Shipping Documentation DID : +971 04 4938219 APRIL Fine Paper Trading (Middle Ea | BL_COMPARISON | rule | 0 | — |
| email_223 | b | TO CONFIRM DOCS _ 5ALT-67700 _ CEBU_PHILIPPINES _ CLIFFORD PAPER INC _ SIJ7848588 | Dear Arlene, Please assist to send the draft BL for SIJ0061675 for checking asap. Thank you. Best Regards, Deswita Elvyani Shipping Documentation DID : +971 04 4938284 APRIL Fine Paper Trading (Middle | BL_COMPARISON | rule | 0 | — |
| email_237 | b | RE_ AIE - BRISBANE_AUSTRALIA - ONE(SINF28703203) - 5RMY-76170 - 5250077587 - SAFQA LIMITED - OA_CFR | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Lee, Please assist to send the draft B | BL_COMPARISON | rule | 0 | — |
| email_242 | b | RE_ TO CONFIRM DOCS _ 5APH-32194 _ CALLAO_PERU _ 3S PAPER PRODUCTS SDN BHD _ SIN017226016 | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Lee, Please assist to send the draft B | BL_COMPARISON | rule | 0 | — |
| email_271 | b | RE_ TO CONFIRM DOCS _ 5SUS-48121 _ CALLAO_PERU _ PACIFIC OFFICE (M) SDN BHD _ SIJ0333736 | Dear Teo, Please assist to send the draft BL for SIJ3466925 for checking asap. Thank you. Best Regards, Hari Mardianto Shipping Documentation DID : +971 04 4938259 APRIL Fine Paper Trading (Middle Eas | BL_COMPARISON | rule | 0 | — |
| email_292 | b | AFEMY - NEW YORK_US - CMA(SIJ4111593) - 5AAT-04098 - 5250073665 - NAGAPPA EXPORTS - LC | Dear Mitchelle, Please assist to send the draft BL for SIJ1952569 for checking asap. Thank you. Best Regards, Lee Guan Cheng Shipping Documentation DID : +971 04 4938268 APRIL Fine Paper Trading (Midd | BL_COMPARISON | rule | 0 | — |
| email_299 | b | TO CONFIRM DOCS _ 5RMY-43598 _ SAVANNAH_US _ NAGAPPA EXPORTS _ SIN296184462 | Dear Ooi, Please assist to send the draft BL for SIN671462831 for checking asap. Thank you. Best Regards, Najiha Nur Hanna Shipping Documentation DID : +971 04 4938268 APRIL Fine Paper Trading (Middle | BL_COMPARISON | rule | 0 | — |
| email_318 | b | TO CONFIRM DOCS _ 5RVN-69036 _ KLAIPEDA_LITHUANIA _ PACIFIC OFFICE (M) SDN BHD _ SINF49843624 | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Syed, Please assist to send the draft  | BL_COMPARISON | rule | 0 | — |
| email_350 | b | TO CONFIRM DOCS _ 5RAE-81331 _ NEW YORK_US _ HABRAS INTERNATIONAL LIMITED _ SIN287232440 | Dear Teo, Please assist to send the draft BL for SIN793110291 for checking asap. Thank you. Best Regards, Hari Mardianto Shipping Documentation DID : +971 04 4938233 APRIL Fine Paper Trading (Middle E | BL_COMPARISON | rule | 0 | — |
| email_421 | b | TO CONFIRM DOCS _ 5SUS-73605 _ APAPA_NIGERIA _ 3S PAPER PRODUCTS SDN BHD _ SIJ9578671 | Dear Elisa, Please assist to send the draft BL for SIJ8153523 for checking asap. Thank you. Best Regards, Syed Faraz Ali Shipping Documentation DID : +971 04 4938296 APRIL Fine Paper Trading (Middle E | BL_COMPARISON | rule | 0 | — |
| email_432 | b | TO CONFIRM DOCS _ 5RMY-22618 _ HOUSTON_US _ UAB NOVAKOPA _ SIN323415959 | Dear Deswita, Please assist to send the draft BL for SIN775244182 for checking asap. Thank you. Best Regards, Deswita Elvyani Shipping Documentation DID : +971 04 4938217 APRIL Fine Paper Trading (Middle | BL_COMPARISON | rule | 0 | — |
| email_451 | b | TO CONFIRM DOCS _ 5APH-74204 _ FREMANTLE_AUSTRALIA _ INTERNATIONAL FOREST PRODUCTS LLC _ SIN087182749 | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Najiha, Please assist to send the draf | BL_COMPARISON | rule | 0 | — |
| email_459 | b | TO CONFIRM DOCS _ 5RMY-34778 _ FREMANTLE_AUSTRALIA _ KTP CO., LTD _ SIJ7852491 | Dear Teo, Please assist to send the draft BL for SIJ4168601 for checking asap. Thank you. Best Regards, Sathiyavani Munusamy Shipping Documentation DID : +971 04 4938255 APRIL Fine Paper Trading (Midd | BL_COMPARISON | rule | 0 | — |
| email_476 | b | RE_ Draft BL INDO SUKSES 65 V.51NW1 SINGAPORE - amend BL 050 | Dear Arlene, Please assist to send the draft BL for MSDUL0942581793 for checking asap. Thank you. Best Regards, Elisa Tukiman Shipping Documentation DID : +971 04 4938259 APRIL Fine Paper Trading (Mid | BL_COMPARISON | rule | 0 | — |
| email_493 | b | RE_ TO CONFIRM DOCS _ 5RCY-58695 _ JEBEL ALI_UAE _ KPP-ANTALIS (SINGAPORE) PTE. LTD. _ MCLSIN4389982 | WARNING: This email originated outside of our organisation. As a security measure, please exercise caution with E-Mail content and any links or attachments. Dear Syed, Please assist to send the draft  | BL_COMPARISON | rule | 0 | — |
| email_506 | a | RE_ AFRT - LONG BEACH_US - EVER(EGLV433335384951) - 5RSG-19787 - 5250071809 - EAST BRIGHT FZ-LLC - OA_CFR | Dear Team, Please compare the SI and draft BL for 070500263211 and confirm (attachments appear to have been dropped). Thank you. | BL_COMPARISON | rule | 0 | — |
| email_507 | a | RE_ TO CONFIRM DOCS _ 5AKR-00230 _ KOPER_SLOVENIA _ 3S PAPER PRODUCTS SDN BHD _ YMJAI530601198 | Dear Team, Please compare the SI and draft BL for I756178688 and confirm (the draft BL is still missing). Thank you. | BL_COMPARISON | rule | 1 | attachments/email_507_SI.txt |
| email_508 | a | AIE - CALLAO_PERU - EVER(EGLV577449160936) - 5RUS-14911 - 5250078941 - KPP-ANTALIS (SINGAPORE) PTE. LTD. - LC | Dear Team, Please compare the SI and draft BL for 070500259520 and confirm (attachments appear to have been dropped). Thank you. | BL_COMPARISON | rule | 0 | — |
| email_509 | a | AFRT - CALLAO_PERU - YM(YMJAI926322399) - 5RVN-11404 - 5250072886 - INTERNATIONAL FOREST PRODUCTS LLC - CFR | Dear Team, Please compare the SI and draft BL for I821374556 and confirm (the draft BL is still missing). Thank you. | BL_COMPARISON | rule | 1 | attachments/email_509_SI.txt |
| email_510 | a | TO CONFIRM DOCS _ 5RVN-06271 _ MERSIN_TURKEY _ SAFQA LIMITED _ OOLU0811260030 | Dear Team, Please compare the SI and draft BL for PSGSE8356691 and confirm (attachments appear to have been dropped). Thank you. | BL_COMPARISON | rule | 0 | — |

### Cause and fix

The false-positive rows contained booking/reference numbers such as
`SIN525534192`. The old expression matched the `SI` prefix inside those
identifiers because it had a word boundary before `SI` but not after it. The
same rows also contained the generic word `checking`, which was treated as
comparison intent.

The fix:

1. requires a trailing boundary after the standalone `SI` token;
2. recognizes a draft-BL send/provide/share/forward request without an explicit
   SI/BL comparison request as deterministic `GENERAL`; and
3. preserves explicit `compare`, `verify`, `against`, or equivalent SI/BL
   requests as `BL_COMPARISON`, including dropped-attachment cases.

Regression coverage is in `backend/tests/test_pipeline.py` for both patterns.

## Step 2 — `missing_value` (41 rows)

The apparent missing-value queue is dominated by a deliberate domain gate, not
failed extraction:

| Root cause | Rows | Field instances | Examples |
| --- | ---: | ---: | --- |
| Named consignee versus `To the Order of` consignee; both values are present but their legal semantics are ambiguous | 40 | 40 | Same party: `email_032`, `email_065`; different party: `email_004`, `email_107` |
| Placeholder/absent SI value found under a valid label | 3 | 4 | `email_516`, `email_517`, `email_518` |
| Present but not extracted | 0 | 0 | None observed |
| Extracted but rejected by validation | 0 | 0 | None observed |

The source labels and values for the placeholder cases were:

- `email_516`: SI `Gross Weight毛重(KGS): N/A`; BL has `Gross Weight (KG): 235,550 KG`.
- `email_517`: SI `Port of Discharge (POD): TBA`; BL has `Port of Discharge: CALLAO, PERU (PECLL)`.
- `email_518`: SI `PORT OF DISCHARGE: N/A` and `GROSS WEIGHT: ____MT`; BL has `APAPA, NIGERIA (NGAPP)` and `134,586 KG`.

Every pre-fix row is listed below. “Present on both” means no document field is
missing: the comparison is skipped intentionally by the order-mode rule.

| ID | Field/document finding |
| --- | --- |
| email_004 | consignee: present on both; named/order-mode ambiguity |
| email_032 | consignee: present on both; named/order-mode ambiguity |
| email_040 | consignee: present on both; named/order-mode ambiguity |
| email_052 | consignee: present on both; named/order-mode ambiguity |
| email_065 | consignee: present on both; named/order-mode ambiguity |
| email_068 | consignee: present on both; named/order-mode ambiguity |
| email_091 | consignee: present on both; named/order-mode ambiguity |
| email_096 | consignee: present on both; named/order-mode ambiguity |
| email_107 | consignee: present on both; named/order-mode ambiguity |
| email_113 | consignee: present on both; named/order-mode ambiguity |
| email_128 | consignee: present on both; named/order-mode ambiguity |
| email_133 | consignee: present on both; named/order-mode ambiguity |
| email_146 | consignee: present on both; named/order-mode ambiguity |
| email_174 | consignee: present on both; named/order-mode ambiguity |
| email_198 | consignee: present on both; named/order-mode ambiguity |
| email_225 | consignee: present on both; named/order-mode ambiguity |
| email_227 | consignee: present on both; named/order-mode ambiguity |
| email_235 | consignee: present on both; named/order-mode ambiguity |
| email_243 | consignee: present on both; named/order-mode ambiguity |
| email_256 | consignee: present on both; named/order-mode ambiguity |
| email_273 | consignee: present on both; named/order-mode ambiguity |
| email_275 | consignee: present on both; named/order-mode ambiguity |
| email_300 | consignee: present on both; named/order-mode ambiguity |
| email_312 | consignee: present on both; named/order-mode ambiguity |
| email_313 | consignee: present on both; named/order-mode ambiguity |
| email_349 | consignee: present on both; named/order-mode ambiguity |
| email_361 | consignee: present on both; named/order-mode ambiguity |
| email_383 | consignee: present on both; named/order-mode ambiguity |
| email_391 | consignee: present on both; named/order-mode ambiguity |
| email_398 | consignee: present on both; named/order-mode ambiguity |
| email_405 | consignee: present on both; named/order-mode ambiguity |
| email_410 | consignee: present on both; named/order-mode ambiguity |
| email_411 | consignee: present on both; named/order-mode ambiguity |
| email_434 | consignee: present on both; named/order-mode ambiguity |
| email_435 | consignee: present on both; named/order-mode ambiguity |
| email_483 | consignee: present on both; named/order-mode ambiguity |
| email_491 | consignee: present on both; named/order-mode ambiguity |
| email_498 | consignee: present on both; named/order-mode ambiguity |
| email_516 | gross_weight_kg: SI placeholder `N/A`; BL found `235,550 KG` |
| email_517 | consignee present on both; port_of_discharge: SI placeholder `TBA`; BL found `CALLAO, PERU (PECLL)` |
| email_518 | consignee present on both; port_of_discharge: SI placeholder `N/A`; BL found `APAPA, NIGERIA (NGAPP)`; gross_weight_kg: SI ambiguous `____MT`; BL found `134,586 KG` |

No label alias, table-layout, numeric-format, or validation-rejection cause was
observed in this 41-row group. The order-mode cases were not changed: making a
named consignee and an order-mode consignee automatically match would turn a
genuine semantic uncertainty into `OK`, which violates the project guardrail.

## Step 3 — `unreadable` and `wrong_doc_type`

All 11 cases were correctly escalated after reading the parser output.

| Reason | IDs | Finding |
| --- | --- | --- |
| unreadable | `email_499`, `email_511` | SI readable, BL PDF has no usable text/image extraction. |
| unreadable | `email_512`, `email_513`, `email_514` | Both referenced PDFs are unreadable to the current local parser. |
| unreadable | `email_515` | SI readable, BL PDF unreadable. |
| wrong_doc_type | `email_501` | Both text attachments identify as Shipping Instruction; no BL candidate. |
| wrong_doc_type | `email_502`, `email_504` | Second attachment identifies as Packing List. |
| wrong_doc_type | `email_503`, `email_505` | Second attachment identifies as Certificate of Origin. |

These are not recoverable by a deterministic text rule without inventing a
document identity or using the unavailable vision/LLM path, so they remain
review cases.

## Status and review counts

| Export measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| OK | 409 | 433 | +24 |
| MISMATCH | 30 | 30 | 0 |
| NEEDS_REVIEW | 81 | 57 | -24 |
| missing_attachment | 29 | 5 | -24 |
| missing_value | 41 | 41 | 0 |
| unreadable | 6 | 6 | 0 |
| wrong_doc_type | 5 | 5 | 0 |

The category counts changed from `BL_COMPARISON=153, GENERAL=147` to
`BL_COMPARISON=129, GENERAL=171`; `SI_REQUEST=141`, `INVOICE_QUERY=56`, and
`SPAM=23` were unchanged. The post-fix rules-only pipeline made zero LLM calls.

## Determinism and contract checks

- The two post-fix 520-row submissions have identical SHA-256:
  `0527BB423316C1151A28977877B775AE2F342449C1970BB6BC5DF2939000CD2F`.
- The export contains 520 email keys and the same five row keys as
  `data/sample_submission.json`: `category`, `status`, `review_reason`,
  `has_defect`, and `defect_fields`.
- Backend regression suite after the implementation changes:
  `73 passed, 1 xfailed, 2 xpassed, 2 warnings`.
- No secret, environment file, answer key, official scorer, or real database
  was read or modified.

The only change kept was the general Stage 1 classification correction. No
fixes were reverted. Remaining review cases are the policy-preserving
order-mode ambiguities, true placeholders, unreadable PDFs, wrong document
types, and five explicit comparison requests that genuinely lack a complete
SI/BL pair.
