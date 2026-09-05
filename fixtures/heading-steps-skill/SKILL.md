---
name: expense-filing
description: Files an expense report end to end — extract receipt data, validate it, submit it, and confirm the submission.
---

# Expense Filing

Files a single expense from a receipt image through to a confirmed
submission. The stages below run in order.

## Prerequisites

- Access to the expense portal.
- A receipt image or PDF from the user.

## Step 1: Extract receipt details

Read the receipt and pull out merchant, date, amount, and currency. If the
image is unreadable, ask the user for a clearer copy before continuing.

## Step 2: Validate against policy

Check the amount from step 1 against the per-category limit. When the amount
exceeds the limit, stop and tell the user which policy rule blocks it.

## Step 3: Log in to the portal

Authenticate with the stored credentials. If login fails, retry up to three
times, then abort and report the failure rather than guessing at a fix.

## Step 4: Submit the expense

Enter the fields from step 1 and attach the receipt. Submit the form.

## Step 5: Confirm the submission

Re-read the confirmation page. If no confirmation ID appears, return to
step 4 and resubmit once; if it still fails, report the error to the user.
