# Discord+ plugin catalogue
Public metadata-only catalogue, with original MIT-licensed Plugin Library and ShowMeYourName plugins. It contains no Discord APKs, private app source, account details, signing keys or secrets.

Only plugins with source changes within approximately nine months (since 2026-02-18) are listed, plus a static security skim (no token exfiltration, no remote eval, no unknown hosts). Automation, quest-farming, spoofing, account-switching/token tools and webhook forwarding plugins are excluded. At generation time, manifests and JS resolve via HTTPS, and declared SHA256 hashes match downloaded JS. This is **not a device-compatibility or security guarantee**; no signed-in phone testing has occurred. Every plugin runs inside your Discord client, so inspect its source first.

`plugins-full.json` contains manifest metadata plus source URLs and date/check fields. The bundled library uses a local fallback if this URL is unavailable. Code for third-party plugins is fetched directly from upstream only when installed; it is not hosted here. Developers retain their original author credit and source links.

Online URL after publication:
https://raw.githubusercontent.com/IRISHDEVELOPERDEV/discord-plus-catalog/main/plugins-full.json

This is manually maintained, not an automatic update service or scheduled monitor.

## Themes and fonts

`themes.json` lists Vendetta/Revenge theme JSONs (spec 2/3) and `fonts.json` lists Revenge font definitions (spec 1). Both link to each author's own hosted file; nothing is re-hosted here. Theme entries include a five-colour swatch (background primary/secondary/tertiary, text, accent) taken from the theme file.

## Discord+ Library

`plugin-library/` (MIT) shows Plugins, Themes and Fonts tabs with search, categories, installed badges, one-tap install/apply/remove, Reset to default, and a paste-a-link installer. It adds a banner to Revenge's Plugins, Themes and Fonts pages and a top-level **Discord+** settings section. It never installs or enables anything on its own.

## HiddenChannelLocks (original, MIT)

`hidden-channel-locks/` shows hidden/obfuscated channels as lock placeholders in their real category; tap for received metadata. Discord withholds names and messages of hidden channels; this plugin cannot recover them. It replaces the marcmy ShowHiddenChannels entry, which stopped showing names after Discord channel obfuscation.
