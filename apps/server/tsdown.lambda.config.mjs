export default {
  entry: "./src/lambda.ts",
  format: "esm",
  target: "node24",
  platform: "node",
  outDir: "./dist-lambda",
  clean: true,
  shims: true,
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false,
  },
};
