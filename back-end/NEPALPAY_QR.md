# QR payment integration status

## Modes

- `PAYMENT_PROVIDER=nepalpay`, `NEPALPAY_MODE=real`: requires
  `NCHL_MERCHANT_ACCOUNT_TEMPLATE`, supplied verbatim by the enrolled acquiring
  bank/NCHL integration. DOKKO does not generate this template or its merchant,
  terminal, acquirer, GUID, or network values.
- `NEPALPAY_MODE=emvco_test`: produces an EMVCo structural test QR only when a
  deliberately supplied test merchant-account template is present. It is not a
  NepalQR or KumariSmart-payable QR.
- `PAYMENT_PROVIDER=mock`, `MOCK_PAYMENT_ENABLED=true`: development/test only;
  it is rejected when `NODE_ENV=production`. The vendor simulation endpoint
  runs normal provider verification before the order is changed to paid.

## Current validation levels

1. `validateEmvcoQr` validates TLV structure, ordering, dynamic indicator,
   NPR/NP fields, amount, nested merchant account templates, forbidden HTML,
   and CRC-16/CCITT-FALSE.
2. `validateNepalQr` returns `NEPALQR_NETWORK_VALIDATION_PENDING`. The public
   NCHL material does not provide enough merchant-account/dynamic transaction
   detail to safely implement or claim network validation.
3. Network payment remains blocked until the acquirer provides the approved
   merchant configuration and transaction verification/callback contract.

No generic QR decoder result establishes network acceptance or payment.
