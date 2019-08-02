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

function findObjectInCollection(id, flagIndex) {
    for(let i=flagIndex.length; i>=0; i--) {
        if(flagIndex[i] == id) return i;
    }
    return -1;
    // return flagIndex.indexOf(id);
    // return collection.filter( function(item) { return item.id == id } )[0];
}

function updateFlagCollection(party, collection, flagIndex, year, flags) {
    let objIndex = findObjectInCollection(party.id, flagIndex);
    let obj = null;

    if(objIndex == -1) {
        // No existe el party todavía...
        let newObj = {};
        newObj.id = party.id;
        newObj.name = party.name;
        newObj.type = 'party';
        newObj.entity = party.entity;
        if(party.hasOwnProperty('parent')) {
            newObj.parent = party.parent;
        }
        newObj.flags = JSON.parse(JSON.stringify(flags));
        newObj.contract_count = [];
        newObj.contract_count.push({ year: year, count: 1 });

        collection.push(newObj);
        flagIndex.push(party.id);
    }
    else {
        obj = collection[objIndex];
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

function getContractCriteriaSummary(collection, criteriaObj) {
    let summary = [];

    collection.map( (item) => {
        let contractFlagObj = {
            ocid: item.ocid,
            date_signed: item.hasOwnProperty('date_signed')? item.date_signed : null,
            source: item.source,
            parties: item.parties
        };
        let criteria_score = JSON.parse(JSON.stringify(criteriaObj));

        Object.assign(contractFlagObj, { criteria_score });
        Object.assign(contractFlagObj, { rules_score: {} });

        // Iterar sobre categorias
        Object.keys(item.flags).map( function(categoria, index) {
            var flagCount = 0;
            contractFlagObj.rules_score[categoria] = {};

            // Iterar sobre banderas
            Object.keys(item.flags[categoria]).map( function(bandera, subindex) {
                contractFlagObj.rules_score[categoria][bandera] = item.flags[categoria][bandera][0].score;
                contractFlagObj.criteria_score[categoria] += item.flags[categoria][bandera][0].score;
                flagCount++;
            } );

            contractFlagObj.criteria_score[categoria] /= flagCount;
        } );

        // calcular total_score global
        var global_total = 0;
        var num_categorias = 0;
        Object.keys(contractFlagObj.criteria_score).map( function(cat, index) {
            if(cat != 'total_score') {
                global_total += contractFlagObj.criteria_score[cat];
                num_categorias++;
            }
        } );
        contractFlagObj.criteria_score.total_score = global_total / num_categorias;

        summary.push(contractFlagObj);
    } );

    return summary;
}

function getPartyCriteriaSummary(collection, criteriaObj) {
    let summary = [];

    collection.map( (item) => {
        let party = {
            id: item.id,
            name: item.name,
            type: item.entity
        };

        if(item.hasOwnProperty('parent')) {
            Object.assign( party, { parent: item.parent } )
        }

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

function sendContractCollectionToDB(flagCollection, dbCollection) {
    const operations = [];

    flagCollection.map( (flag) => operations.push( { insertOne: { document: flag } } ) );

    return dbCollection.bulkWrite(operations, { ordered:true }, function(err, r) {
        if(err) console.log('ERROR', err);
    } );
}

function sendPartyCollectionToDB(flagCollection, dbCollection) {
    const operations = [];

    flagCollection.map( (flag) => operations.push( { updateOne: { filter: { 'party.id': flag.party.id }, update: { $set: {party: flag.party, criteria_score:flag.criteria_score}, $push: {years: flag.years[0]} }, upsert: true } } ) );

    return dbCollection.bulkWrite(operations, { ordered:true }, function(err, r) {
        if(err) console.log('ERROR', err);
    } );
}

module.exports = {
    createFlagCollectionObject,
    updateFlagCollection,
    getPartyCriteriaSummary,
    getContractCriteriaSummary,
    sendPartyCollectionToDB,
    sendContractCollectionToDB
};
