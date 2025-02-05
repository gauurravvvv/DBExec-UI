/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const response = `Worker received: ${data}`;
  postMessage(response);
});
