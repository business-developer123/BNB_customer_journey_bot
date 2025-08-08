module.exports = {
    apps: [
      {
        name: "my-server",
        script: "src/index.ts",
        interpreter: "npx",
        interpreter_args: "ts-node",
        watch: false
      }
    ]
  }
  