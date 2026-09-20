# Irish pay rules

Every rule here carries a source and the date it was checked. Nothing goes
in this file from memory. Code reads these rules from one place — never
hardcode a rate at the call site.

Last checked: **2026-09-20**

---

## Sunday work

**There is no statutory Sunday multiplier in Ireland.** No 1.33x, no 1.5x.

Section 14 of the Organisation of Working Time Act 1997 entitles an
employee required to work on a Sunday to compensation by one or more of:

- an allowance "of such an amount as is reasonable having regard to all the
  circumstances"
- a reasonable increase in the rate of pay
- reasonable paid time off
- a combination of the above

**Exception:** no additional compensation is due where the fact of having
to work Sunday "has otherwise been taken account of in the determination of
his or her pay" — i.e. it can legitimately be baked into the hourly rate,
which many hospitality contracts do.

Where a collective agreement covers comparable employees, that agreement
sets the benchmark for what counts as reasonable.

**Implication for the app:** it cannot derive a Sunday premium from law. It
applies whatever premium the user's own contract gives them (configurable,
default none), and may surface that an entitlement could exist where the
user works Sundays and no premium appears anywhere.

Source: [Organisation of Working Time Act 1997, s.14](https://www.irishstatutebook.ie/eli/1997/act/20/section/14/enacted/en/html) — checked 2026-09-20

---

## Annual leave accrual

Three statutory methods. **The employee is entitled to whichever gives the
greatest entitlement**, so the app should compute all three and present the
best.

1. **1,365-hour method** — worked at least 1,365 hours in the leave year →
   maximum 4 working weeks. Not available if the employee changed jobs
   during that leave year.
2. **117-hour month method** — one third of a working week for each
   calendar month in which at least 117 hours were worked.
3. **8% method** — 8% of hours worked in the leave year, capped at 4
   working weeks. This is the one that normally applies to part-time work.

Where someone works full-time for part of a year and part-time for the
rest, the calculation is done separately for each period.

Source: [Citizens Information — Annual leave](https://www.citizensinformation.ie/en/employment/employment-rights-and-conditions/leave-and-holidays/annual-leave-public-holidays/) — checked 2026-09-20

---

## Holiday pay rate (distinct from accrual)

Accrual says *how much leave*. This says *what that leave is paid at*, and
it is a separate calculation people routinely get wrong.

Where pay varies week to week — variable hours, commission, bonuses —
holiday pay is **the average of pay over the 13 weeks before the leave is
taken**.

**Implication for the app:** the holiday tab needs a rolling 13-week pay
average, which falls straight out of the shift log. Accrual and pay rate
are two different numbers and should be shown as such.

Source: [Citizens Information — Annual leave](https://www.citizensinformation.ie/en/employment/employment-rights-and-conditions/leave-and-holidays/annual-leave-public-holidays/) — checked 2026-09-20

---

## Not yet researched — do not assume

- **Leave year definition.** The statutory leave year and an employer's own
  leave year may differ. This determines the window for the 8% cap and for
  counting 117-hour months, so it has to be pinned down before the holiday
  tab is built. Likely needs to be user-configurable.
- **Public holidays.** Entitlement for part-time workers is a separate
  regime from annual leave and part-timers commonly miss it. Do not assume
  it resembles the Sunday or annual leave rules.
- **Unpaid breaks.** Rest break entitlements and whether they are paid.
- **What counts as a "working week"** for the purposes of the 4-week cap
  when hours vary.
- **PAYE / USC / PRSI.** Deliberately out of scope — see CLAUDE.md rule 4.
