'use strict';

import { GalgameRenderer } from './js/galgame-renderer.js';

let rendererInstance = null;

export function initVisualNovel(ctx) {
    if (rendererInstance) {
        rendererInstance.show();
        return rendererInstance;
    }

    rendererInstance = new GalgameRenderer(ctx);
    rendererInstance.init();
    return rendererInstance;
}

export function destroyVisualNovel() {
    if (rendererInstance) {
        rendererInstance.destroy();
        rendererInstance = null;
    }
}

export { rendererInstance as visualNovelInstance };
