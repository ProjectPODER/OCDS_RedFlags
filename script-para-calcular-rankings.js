//Este script agrega en party_flags los rankings
// Hace una estructura ranking.type-govLevel = int en cada party

//Ranking, query
const rankings = {
  "uc-todas": {"party.type": "buyer"},
  "uc-federales": {"party.type": "buyer", govLevel: "country"},
  "uc-estatales": {"party.type": "buyer", govLevel: "region"},
  "uc-municipales": {"party.type": "buyer ", govLevel: "city"},
  "estados": {"party.type": "state"},
  "municipios": {"party.type": "municipality"},
  "bancos": {"party.type": "funder"},
  "dependencia-todas": {"party.type": "dependency"},
  "dependencia-federal": {"party.type": "dependency", govLevel: "country"},
  "dependencia-estatal": {"party.type": "estatal", govLevel: "region"},
}

for (r in rankings) {
  counter = 0;
  print(r,counter);
  db.getCollection("party_flags").find(rankings[r]).sort({total_score: -1}).forEach(function(x) {
    counter++;
    // printjson(x);
    if (!x.ranking) {
      x.ranking = {};
    }
    x.ranking[r] = counter;
    print(x.party.id,counter,x.total_score);
    db.getCollection("party_flags").save(x);
  })
}
