#Esto funcionó bien ejecutado desde Studio3T IntelliShell

db.getCollection("contract_flags").find({}).forEach(function(x) {
  	sup = "";
  	x.parties.forEach(function(p) {
  		if (p.entity == "supplier") {
  			sup = p.id;
  		}
  	})

	db.getCollection("contracts_ocds").find({ocid:x.ocid,"parties.id":sup}).forEach(function (z) {
	  z.total_score = x.criteria_score.total_score;
	  db.getCollection("contracts_ocds").save(z)
	});
})

