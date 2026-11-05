const { nanoid } = require("nanoid");

function newId(prefix) {
  return `${prefix}_${nanoid(10)}`;
}

module.exports = { newId };
