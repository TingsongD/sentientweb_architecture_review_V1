# Features Section Specification - Browserbase

## Overview
The features section on Browserbase.com is an interactive component consisting of a list of feature cards on the right and a corresponding 3D interactive cube on the left. Each feature card expands when active/hovered to reveal a list of benefits.

## Screenshots
![Features Overview](https://sc02.alicdn.com/kf/A2d216b5248ba4901abc97769723f1524P.png)
![Active Feature Card](https://sc02.alicdn.com/kf/A1662629a36654005b62e0ccf5930ae380.png)

## Component Structure
The section is contained within a `<section>` tag with a centered `<h2>Features</h2>`.
The feature cards are organized in a vertical list.

### 1. Feature Cards
Each card is a clickable element (likely a `div` or `button` depending on implementation) that acts as a trigger for the interactive cube.

#### **Card Styles (Normal State)**
- **Background**: `#FFFFFF` (`rgb(255, 255, 255)`)
- **Border**: `1px solid #CDCDCD` (`rgb(205, 205, 205)`)
- **Border Radius**: `0px`
- **Padding**: `32px`
- **Margin**: `0px 0px -1px` (overlapping borders for vertical list)
- **Transition**: `background-color 0.5s`
- **Box Shadow**: `none`

#### **Card Styles (Active/Hover State)**
- **Background**: `#FFFCEB` (Light Cream/Yellow)
- **Border**: Remains the same.
- **Shadow**: Subtle inner/outer shadow if any (visual inspection suggests primary change is background color).

### 2. Typography
- **Feature Title (H3)**:
  - **Font Family**: `"PP Supply Sans"`
  - **Font Size**: `16px`
  - **Font Weight**: `400`
  - **Color**: `#000000`
- **Content List (UL/LI)**:
  - **Font Family**: Inherited
  - **Font Size**: Base size (likely 14px or 16px)
  - **Color**: `#000000`
  - **List Style**: Bulleted when expanded.

### 3. Feature Content & Icons

| Feature | Title | Content Points | Icon Description |
|---|---|---|---|
| **1** | **Seamless integration** | - Compatible with Playwright, Puppeteer, Selenium, or our own framework, Stagehand.<br>- Integrate without changing any of your existing code, just point it at our browsers.<br>- Connect natively using the Chrome DevTools Protocol. | Desktop/Window icon with a connecting node. |
| **2** | **Scalable** | - Spin up 1000s of browsers in milliseconds.<br>- Serverless infrastructure means you don't need to wait.<br>- We'll do the heavy lifting - run your code anywhere. | Layers/Planes icon (stacked boxes). |
| **3** | **Fast** | - Globally located browsers to minimize latency between the browser and your users.<br>- 2 vCPUs for each browser means pages load lightning fast. | Speedometer/Clock with arrow. |
| **4** | **Secure** | - Isolated browser instances to ensure data privacy and security.<br>- SOC-2 Type 1 and HIPAA compliant. Self-hosted available for ultimate control.<br>- Configurable logging options for maximum control of sensitive data. | Padlock icon. |
| **5** | **Observable** | - Use our Live View iFrame to embed what's happening in the browser, and even let your users control the browser directly from your application.<br>- Browser session recording, source code capture, and command logging enables easy debugging of past sessions. | Viewport/Eye icon (columnar bars). |
| **6** | **Stealth** | - Managed captcha solving, residential proxies, and fingerprint generation to keep your automations running smoothly.<br>- Our proxy super network intelligently picks the best proxy for your target.<br>- Configure anything, from browser fingerprint to proxy geolocation. | Target/Crosshair icon with dot. |
| **7** | **Extensible** | - API support for File Uploads, Downloads, or Custom Browser Extensions.<br>- Use the Contexts API to persist cookies or other browser state across multiple sessions.<br>- First class SDKs available for Node.js and Python. | Box with nodes/extensions. |
| **8** | **Developer First** | - Get started in minutes with our Browser Playground and AI Codegen feature to easily generate your first script.<br>- Comprehensive documentation with guides on performance, parallelization and authentication.<br>- Quick start guides in Node.js and Python. | Code block/Terminal icon. |

## Interactive Behavior
- **Hover/Click**: Hovering or clicking a card activates it.
- **Visual Feedback**: The background color transitions to a light yellow.
- **Cube Animation**: The 3D cube on the left rotates/changes its visual state to match the selected feature.
- **Content Expansion**: The descriptive list items are only fully visible when the card is active.

## Technical Details (Extracted Styles)
```json
{
  "container": {
    "background": "rgb(255, 255, 255)",
    "border": "1px solid rgb(205, 205, 205)",
    "padding": "32px",
    "transition": "background-color 0.5s"
  },
  "h3": {
    "fontFamily": "\"PP Supply Sans\"",
    "fontSize": "16px",
    "fontWeight": "400",
    "color": "rgb(0, 0, 0)"
  }
}
```
