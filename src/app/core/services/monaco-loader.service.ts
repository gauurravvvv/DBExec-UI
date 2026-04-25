import { Injectable } from '@angular/core';

declare const require: any;

const MONACO_VERSION = '0.45.0';
const MONACO_CDN = `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min/vs`;
const LOADER_URL = `${MONACO_CDN}/loader.min.js`;
const LOADER_SRI = 'sha384-UcP5/iVWyRzIhnVjcB2o9W1eoYKL5fAhHTRzvFZg8ctOsoAoDeBQyQuyIk+BJ/nh';

@Injectable({ providedIn: 'root' })
export class MonacoLoaderService {
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    if (typeof (window as any).monaco !== 'undefined') {
      this.loadPromise = Promise.resolve();
      return this.loadPromise;
    }

    this.loadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LOADER_URL;
      script.integrity = LOADER_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        require.config({ paths: { vs: MONACO_CDN } });
        require(['vs/editor/editor.main'], () => resolve(), (err: any) => reject(err));
      };
      script.onerror = () => reject(new Error('Failed to load Monaco loader'));
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  get isLoaded(): boolean {
    return typeof (window as any).monaco !== 'undefined';
  }
}
