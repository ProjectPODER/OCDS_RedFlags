//Esto funcionó bien ejecutado desde Studio3T IntelliShell
ranking = 1;
db.getCollection("party_flags").find({"party.type": "municipality"}).sort({"criteria_score.total_score": -1}).forEach(function(x) {
  x.ranking = ranking;
  ranking ++;
  db.getCollection("party_flags").save(x)
})

ranking = 1;
db.getCollection("party_flags").find({"party.type": "funder"}).sort({"criteria_score.total_score": -1}).forEach(function(x) {
  x.ranking = ranking;
  ranking ++;
  db.getCollection("party_flags").save(x)
})


ranking = 1;
db.getCollection("party_flags").find({"party.type": "buyer"}).sort({"criteria_score.total_score": -1}).forEach(function(x) {
  x.ranking = ranking;
  ranking ++;
  db.getCollection("party_flags").save(x)
})

ranking = 1;
db.getCollection("party_flags").find({"party.type": "supplier"}).sort({"criteria_score.total_score": -1}).forEach(function(x) {
  x.ranking = ranking;
  ranking ++;
  db.getCollection("party_flags").save(x)
})

ranking = 1;
db.getCollection("party_flags").find({"party.type": "dependency"}).sort({"criteria_score.total_score": -1}).forEach(function(x) {
  x.ranking = ranking;
  ranking ++;
  db.getCollection("party_flags").save(x)
})

ranking = 1;
db.getCollection("party_flags").find({"party.type": "state"}).sort({"criteria_score.total_score": -1}).forEach(function(x) {
  x.ranking = ranking;
  ranking ++;
  db.getCollection("party_flags").save(x)
})

