//Esto funcionó bien ejecutado desde Studio3T IntelliShell

db.getCollection("party_flags").find({}).forEach(function(x) {
  	sup = "";
	if (x.party.type == "buyer" || x.party.type == "dependency" || x.party.type == "Municipio") {
		sup = x.party.id;
	}

	db.getCollection("organizations").find({"simple":sup}).forEach(function (z) {
	  z.total_score = x.criteria_score.total_score;
	  db.getCollection("organizations").save(z)
	});
})

