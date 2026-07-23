# Deploy Master 3.4 LTS Stable Candidate

## Before deployment

1. Download the current GitHub repository as ZIP.
2. Back up the Supabase database.
3. Record the current working commit hash.
4. Confirm Master 3.3/3.4 RC can still sell one test bill.

## Upload

Upload all package files to the repository root and replace duplicate files.

Commit:

```text
Deploy Master 3.4 LTS Stable Candidate
```

## SQL order

Run only these incremental files after the existing Master 3.3 database:

```text
sql/UPGRADE-MASTER-3.4-LTS.sql
sql/UPGRADE-MASTER-3.4-LTS-CASHIER.sql
```

The first adds custom-date reporting.
The second adds the separate cashier module and fixes role enum assignment.

## Initial cashier configuration

1. Open `users-admin.html` as Owner/Admin.
2. Set an Employee Code and initial PIN for the cashier.
3. Select the branch.
4. Save.
5. Log out, open `pos.html`, enter Employee Code + PIN, and open the shift.

## Cache

After GitHub Pages deploys:

```text
Ctrl + Shift + R
```

Use Private/Incognito mode on mobile during UAT.
