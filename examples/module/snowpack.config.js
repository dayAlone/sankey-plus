/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    "": "/",
  },
  workspaceRoot: "../../",
  packageOptions: {
    namedExports: ["d3"],
  },
};
