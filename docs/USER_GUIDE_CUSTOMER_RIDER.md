**Benbax Go — Customer & Rider UI Overview**

**Purpose:**
- Help non-technical users (customers and riders) understand how each app works today, what to expect when using it, and the benefits the platform provides.

**Who this is for:**
- Customers: People placing delivery orders using the mobile customer app.
- Riders: Delivery drivers using the rider app to accept and complete jobs.

**Summary (plain):**
- Customers create deliveries, choose pickup/dropoff details, and pay (card, mobile money, or cash) using a simple flow. They can track the rider in real time and get receipts.

- Riders receive nearby delivery offers, accept or reject them, get navigation to pickup/dropoff points, update delivery status (picked up, delivered), and record proof (photo/signature). Payments are either collected by the rider (cash) or processed via the platform (card/mobile money).

**How the Customer App Works (step-by-step, simple):**
- Open the app and create a delivery: enter the pickup location, dropoff address, and any notes (e.g., "leave at front desk").
- The app shows a price estimate and delivery options. Choose the one you want.
- Choose a payment method:
  - **Card (Paystack):** The app asks to pay by card. You are taken to a secure Paystack payment page where you enter test or real card details. After payment is successful, the app marks the delivery as paid.
  - **Mobile Money (MTN MoMo):** If enabled, the app will prompt to authorize a mobile money transfer.
  - **Cash on Delivery:** Choose to pay the rider in cash when they arrive.
- Track your order live on the map: you can watch the rider travel to pickup and to you.
- When delivered you receive a confirmation and a record of payment in the app (if paid through the platform).

**What the customer sees during payment:**
- If paying by card, the app opens the provider’s secure checkout page (Paystack). The platform provides a payment link and listens for confirmation before updating your order status to "Paid." If the app can’t receive automatic webhooks, it offers a "Check payment" button to verify the payment manually.

**How the Rider App Works (step-by-step, simple):**
- Open the rider app and sign in. The app lists available nearby delivery offers.
- Tap an offer to see pickup and dropoff details, fare, and any special notes.
- Accept the job if you want to take it. Once accepted, navigation and directions are available to pickup location.
- At pickup: mark the order as "Picked up". You can add a photo or note if needed.
- At delivery: mark as "Delivered" and optionally capture proof (photo, signature).
- Payment handling:
  - **Cash on Delivery:** Rider collects the cash and can mark the payment collected in the app.
  - **Platform-processed payments (card/mobile money):** The customer pays through the app. The platform records the payment; the rider does not need to collect money.

**Benefits for Customers (in plain language):**
- Clear pickup and delivery tracking so you know where your item is and when it will arrive.
- Multiple payment options — card, mobile money, or cash — so you can use what’s convenient.
- Secure card payments handled by Paystack (the app doesn’t store your card details).
- Electronic receipts and a history of past deliveries in the app.

**Benefits for Riders (in plain language):**
- See and accept jobs quickly from your phone — more control over what you take.
- Turn-by-turn navigation to pickup and dropoff points saves time.
- Proof capture (photo/signature) protects you and the customer in case of disputes.
- For cash jobs, you collect payment directly; for card/mobile money jobs, the platform handles payments so you only need to deliver.

**Important notes about how payments work today (current state):**
- The app uses **Paystack** for card payments. Paystack returns a secure checkout page and also sends a message (webhook) to the server when a payment succeeds. The system verifies that the amount paid matches the order before marking it "Paid."
- There are fields for **MTN MoMo** configuration, but mobile-money may need additional setup or activation by the operator before it works in production.
- If you test locally, the developer may use Paystack test keys. This means card numbers provided by Paystack’s test mode are required rather than real cards.

**How you can test payments (simple steps for non-technical testers):**
- If you are testing on a device: install the mobile app (Expo build or test flight as provided by the team).
- Ask the developer or support person for a test account and to confirm the app is pointed at the test API.
- If the developer has provided a test Paystack mode, they will supply a test card number. Use that card to complete checkout and confirm the delivery updates to "Paid."
- If the app uses a callback deep link (example: `benbax://payment/callback`), the dev will ensure the app handles it after returning from Paystack.
- If webhooks are required but the API is running locally, the developer will either expose the server to the internet (ngrok) or ask you to use a verification button in the app to re-check payment status.

**What to report if something goes wrong (clear checklist):**
- Which app you used: Customer or Rider, and app version (if shown).
- What you were trying to do (place order, pay by card, accept delivery, mark delivered).
- Exact steps you took and what you expected vs what happened (e.g., "I completed the card form but the app still says pending").
- The time and, if available, the payment reference shown in the app (it looks like `BBX-PAY-...`).
- Screenshots help a lot (payment error messages or missing confirmation).

**Privacy & safety notes for users (plain):**
- The app never stores full card numbers. Payments are processed by a trusted provider (Paystack).
- Do not share your password or full payment details in support messages.

**Next steps for the team (short, non-technical):**
- Make a short internal checklist for testers with: test account, test card number, and a public webhook URL (or a developer available to verify payments manually).
- Enable MTN MoMo only after verifying sandbox credentials and end-to-end flows.

---
If you want, I can:
- Add a short quick-start checklist for testers at the top of this doc.
- Create a one-page printable testing checklist for non-technical testers.

