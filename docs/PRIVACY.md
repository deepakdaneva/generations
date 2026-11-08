# Privacy Policy

Effective: version 1.0. This policy describes how the app actually works.
It has not been reviewed by a lawyer and makes no claim of compliance with
any specific regulation.

## Who runs this service

Generations is open-source software. This policy covers the instances
operated by the project maintainer: <https://generations-prod.web.app>
(Production) and <https://generations-uat.web.app> (UAT, for testing new
features). Anyone who deploys their own copy is responsible for their own
instance and policy.

## What we store

| Data | Source | Stored where | Who can read it |
|---|---|---|---|
| Email address, password (hashed), sign-in method | Registration or Google sign-in | Firebase Authentication | The operator |
| Name, email, role, account status, sign-up date | Registration, admins | Firestore (`users`) | You, the app's admins, the operator |
| Profile picture (resized on your device) | You | Firestore (`users`) | You, the app's admins, the operator |
| Approval request (your name and email) | Created when you first sign in | Firestore (`notifications`) | The app's admins, the operator |
| Your family tree: names, gender, dates of birth, death and anniversary, email, place or address, social links, and relationships | You | Firestore (`trees`) | You and the operator |
| Photos of people in your tree (resized on your device) | You | Firestore (`trees`) | You and the operator |
| Tree settings, such as your last position on the canvas | You | Firestore (`trees`) | You and the operator |
| Theme choice and a counter of password-reset emails | You | Your browser only | Only you |

Google sign-in shares your name and email address with the app. Generations
does not use your Google profile picture or request any other Google data.

**Your family tree is private to you.** Admins of the app can see who has an
account, but they cannot read anyone else's family tree; Firestore Security
Rules enforce this. The operator, who manages the Firebase project, can
technically read all stored data, including family trees. The family tree is
not yet encrypted on your device; end-to-end encryption is planned, and this
policy will change when it arrives.

## Information about other people

A family tree holds information about other people: relatives who may be
alive, children, and people who have died. Only add what you are entitled to
share, respect your relatives' wishes, and remove details when someone asks
you to. Nobody else is notified or can see your tree because you added them.

## What we do not do

- No advertising, no analytics, and no tracking cookies.
- No selling or sharing of your data with anyone.
- No reading of your family tree by the operator, except where needed to
  investigate a problem you report or where required by law.

## Service providers

Generations runs entirely on Google Firebase. Google processes data on the
operator's behalf under the
[Firebase terms](https://firebase.google.com/terms/data-processing-terms):

- **Firebase Authentication** stores sign-in details and sends verification
  and password-reset emails.
- **Cloud Firestore** stores all app data, in region asia-south1 (Mumbai,
  India).
- **Firebase Hosting** serves the app.

## Bot protection (reCAPTCHA)

To stop automated abuse of the free service quota, the app uses Firebase App
Check with Google reCAPTCHA Enterprise, which runs invisibly in your browser.
reCAPTCHA collects hardware and software information (such as device and
application data) and sends it to Google for analysis. Its use is subject to
the [Google Privacy Policy](https://policies.google.com/privacy) and
[Terms of Service](https://policies.google.com/terms). It receives no family
tree data.

## Offline storage on your device

The installable app keeps its own files in your browser's cache so it can
start offline. Your sign-in session is kept in your browser's storage until
you sign out.

## Retention and deletion

Data is kept until it is deleted.

- You can edit or delete people and photos in your tree at any time. Deleted
  data is removed from the database at once.
- The app cannot delete accounts itself (that needs a server, which this
  free-plan app does not have). To delete your account and all of its data,
  ask the operator through the contact below; it is then removed by hand.
- Admins can deactivate an account. A deactivated account keeps its data but
  cannot sign in or read anything.

The operator does not keep separate backups. Deleted data cannot be
recovered.

## Your rights

You can view and correct your data in the app, and ask the operator for a
copy of it or for its deletion.

## Children

Accounts are meant for adults. Information about children in a family tree
is added by their family, under the responsibilities above.

## Security

How the app protects your data, and its known limits, are described in the
[Security policy](../SECURITY.md). No system is perfectly secure.

## Contact

Privacy questions and data requests: open an issue in the project's
[GitHub repository](https://github.com/deepakdaneva/generations/issues).
Do not include personal details in a public issue; say you would like to be
contacted privately. Security problems: report them privately through
[GitHub private vulnerability reporting](https://github.com/deepakdaneva/generations/security/advisories/new).

## Changes

Changes to this policy are listed in the
[release notes](https://github.com/deepakdaneva/generations/releases) and
recorded in the repository history.
