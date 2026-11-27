import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Makes the page's script what the calculator's page has always had: a plain
 * script at the end of the body, which runs as the browser reaches it. Vite
 * moves the script of the entry into the head and leaves it a module script,
 * which runs only when the whole page has been read. By then the browser has
 * sent the toggle events of the cards that the markup has open, and the script
 * would never hear them: the saved state would not note those cards as open.
 */
function plainScriptAtEndOfBody(): Plugin {
  return {
    name: "plain-script-at-end-of-body",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const tag = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/.exec(html);
        if (!tag) throw new Error("the built page has no module script to move");
        if (!html.includes("</body>")) throw new Error("the built page has no end of body");
        return html
          .replace(tag[0], "")
          .replace("</body>", `<script src="${tag[1]}"></script>\n</body>`);
      },
    },
  };
}

export default defineConfig({
  build: {
    // The style of `index.html` is kept as it is written. A minifier rewrites
    // the values of its custom properties (`#ffffff` to `#fff`, the quotes of
    // the font names) and adds properties of its own, and the script reads
    // those values and draws with them.
    cssMinify: false,
    // No module preloading: the page is one file, and a plain script has no
    // module to preload.
    modulePreload: false,
    // One function that runs at once, so that the script is no module and
    // none of its names is the window's; strict, as the modules are written.
    rollupOptions: { output: { format: "iife", banner: '"use strict";' } },
  },
  plugins: [plainScriptAtEndOfBody(), viteSingleFile()],
});
