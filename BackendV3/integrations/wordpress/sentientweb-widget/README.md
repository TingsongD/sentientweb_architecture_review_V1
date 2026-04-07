# SentientWeb WordPress Plugin

This plugin connects a WordPress site to the SentientWeb backend-owned widget platform.

## What it does

- Requests a backend connect URL from `POST /api/wordpress/connect`
- Redirects the admin into the backend approval flow
- Exchanges the one-time link code through `POST /api/wordpress/exchange`
- Stores the returned install key, management token, and `agent.js` URL
- Sends periodic heartbeats to `POST /api/wordpress/heartbeat`
- Disconnects through `POST /api/wordpress/disconnect`
- Injects the backend-served widget script on the public site footer

## Install

1. Copy `sentientweb-widget.php` into a WordPress plugin directory such as:
   `wp-content/plugins/sentientweb-widget/sentientweb-widget.php`
2. Activate the plugin in WordPress admin.
3. Open the `SentientWeb` admin page.
4. Enter your backend origin, then click `Connect to SentientWeb`.

## Notes

- This is a minimal first-party scaffold for the v1 WordPress flow.
- The plugin assumes the backend routes added in `BackendV3` are deployed and reachable.
