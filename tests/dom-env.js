/**
 * Minimal DOM environment for Node.js tests.
 * Call setup() before importing modules that touch the DOM;
 * call teardown() in after() to restore globals.
 */

import { JSDOM } from "jsdom";

let dom;

export function setup() {
  dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
}

export function teardown() {
  if (dom) {
    dom.window.close();
    dom = undefined;
  }
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.HTMLElement;
  delete globalThis.Node;
}
