function createFlagCollectionObject(flags) {
    let flagCollObj = {
        id: '',
        name: '',
        type: '', // Valores: contract, party
        entity: '',
        flags: {}
    };

    flags.map( (flag) => {
        if( !flagCollObj.flags.hasOwnProperty(flag.categoryID) ) {
            flagCollObj.flags[flag.categoryID] = {};
        }

        flagCollObj.flags[flag.categoryID][flag.id] = [];
    } );

    return flagCollObj;
}

function findObjectInCollection(id, collection) {
    return collection.filter( function(item) { return item.id == id } )[0];
}

function updateFlagCollection(party, collection, year, flags) {
    let obj = findObjectInCollection(party.id, collection);

    if(obj === undefined) {
        // No existe el party todavía...
        let newObj = {};
        newObj.id = party.id;
        newObj.name = party.name;
        newObj.type = 'party';
        newObj.entity = party.entity;
        newObj.flags = JSON.parse(JSON.stringify(flags));
        newObj.contract_count = [];
        newObj.contract_count.push({ year: year, count: 1 });

        collection.push(newObj);
    }
    else {
        if(obj.contract_count.filter( function(item) { return item.year == year } ).length == 0)
        {
            // El party no tiene contratos para el año todavía...
            obj.contract_count.push({ year: year, count: 1 });

            // Iteramos por categoría y luego por flag
            Object.keys(flags).map( function(key, index) {
                Object.keys(flags[key]).map( function(subkey, subindex) {
                    // Obtenemos el score para el flag del año del contrato que estamos evaluando
                    var year_flag = flags[key][subkey].filter( function(item) { return item.year == year } )[0];
                    obj.flags[key][subkey].push( { year: year, score: year_flag.score } );
                } );
            } );
        }
        else {
            // El party ya tiene contratos para ese año
            Object.keys(flags).map( function(key, index) {
                Object.keys(flags[key]).map( function(subkey, subindex) {
                    // Primero obtenemos el valor que hay que incorporar al promedio actual
                    var new_value = flags[key][subkey].filter( function(item) { return item.year == year } )[0].score;
                    // Luego obtenemos el promedio actual
                    var old_value = obj.flags[key][subkey].filter( function(item) { return item.year == year } )[0].score;
                    // Después obtenemos el contract_count para ese año
                    var contract_count = obj.contract_count.filter( function(item) { return item.year == year } )[0].count;

                    // Y ahora, aplicamos la fórmula mágica!
                    //      new_score = ( (old_value * contract_count) + new_value ) / (contract_count + 1)
                    // Para mantener el promedio, multiplicamos la cantidad de contratos promediados por el valor promedio
                    // y luego sumamos el nuevo valor al promedio expandido, para finalmente dividir por la cantidad
                    // nueva de contratos (contract_count + 1).
                    var new_score = ((old_value * contract_count) + new_value) / (contract_count + 1);
                    obj.flags[key][subkey].map( (item) => {
                        if(item.year == year) item.score = new_score;
                        return item;
                    } );
                } );
            } );

            // No nos olvidemos de aumentar el contract_count cuando terminemos de procesar el contrato
            obj.contract_count.map( (item) => {
                if(item.year == year) item.count += 1;
                return item;
            } );
        }
    }
}

function getCriteriaSummary(collection, criteriaObj) {
    let summary = [];

    collection.map( (item) => {
        let party = {
            id: item.id,
            name: item.name,
            type: item.entity
        };
        let criteria_score = JSON.parse(JSON.stringify(criteriaObj));
        let years = [];
        let partyFlagObj = {
            party,
            criteria_score,
            years
        };

        // Iterar sobre categorias
        Object.keys(item.flags).map( function(categoria, index) {
            var flagCount = 0;

            // Iterar sobre banderas
            Object.keys(item.flags[categoria]).map( function(bandera, subindex) {
                // Iterar los años para los que haya score en la bandera
                item.flags[categoria][bandera].map( (score) => {
                    if( partyFlagObj.years.filter( (yearObj) => { return yearObj.year == score.year } ).length == 0 ) {
                        let criteriaYearObj = {
                            year: score.year,
                            criteria_score: JSON.parse(JSON.stringify(criteriaObj))
                        }
                        partyFlagObj.years.push(criteriaYearObj);
                    }

                    partyFlagObj.years.map( (yearObj) => {
                        if(yearObj.year == score.year) {
                            yearObj.criteria_score[categoria] += score.score;
                        }
                    } );
                } );
                flagCount++;
            } );

            // Calcular promedios de la categoria por año
            partyFlagObj.years.map( (yearObj) => {
                yearObj.criteria_score[categoria] /= flagCount;
                partyFlagObj.criteria_score[categoria] += yearObj.criteria_score[categoria];
            } );

            partyFlagObj.criteria_score[categoria] /= partyFlagObj.years.length;
        } );

        // calcular total_scores por año
        partyFlagObj.years.map( (yearObj) => {
            var year_total = 0;
            var num_categorias = 0;
            Object.keys(yearObj.criteria_score).map( function(cat, index) {
                if(cat != 'total_score') {
                    year_total += yearObj.criteria_score[cat];
                    num_categorias++;
                }
            } );
            yearObj.criteria_score.total_score = year_total / num_categorias;
        } )

        // calcular total_score global
        var global_total = 0;
        var num_categorias = 0;
        Object.keys(partyFlagObj.criteria_score).map( function(cat, index) {
            if(cat != 'total_score') {
                global_total += partyFlagObj.criteria_score[cat];
                num_categorias++;
            }
        } );
        partyFlagObj.criteria_score.total_score = global_total / num_categorias;

        summary.push(partyFlagObj);
    } );

    return summary;
}

function sendCollectionToDB(flagCollection, dbCollection) {
    const operations = [];

    flagCollection.map( (flag) => operations.push( { updateOne: { filter: { 'party.id': flag.party.id }, update: { $set: {party: flag.party, criteria_score:flag.criteria_score}, $push: {years: flag.years[0]} }, upsert: true } } ) );

    return dbCollection.bulkWrite(operations, { ordered:true }, function(err, r) {
        if(err) console.log('ERROR', err);
    } );
}

module.exports = { createFlagCollectionObject, updateFlagCollection, getCriteriaSummary, sendCollectionToDB };
