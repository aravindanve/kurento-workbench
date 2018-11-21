let idCounter = 0;
function getNextId() {
  idCounter++;
  return idCounter.toString();
}

module.exports = getNextId;
