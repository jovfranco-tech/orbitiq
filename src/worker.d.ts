// Vite ?worker import type declaration
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
