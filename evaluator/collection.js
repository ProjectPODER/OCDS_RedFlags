const hash = require('object-hash');

function createFlagCollectionObject(flags) {
    let flagCollObj = {
        id: '',
        name: '',
        type: '', // Values: contract, party
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
    if( collection[id] ) {
        return collection[id];
    }
    else {
        return -1;
    }
}

function updateFlagCollection(party, collection, year, flags) {
    let obj = findObjectInCollection(party.id, collection);

    if(obj == -1) { // Party hasn't been seen yet
        let newObj = {};

        newObj.id = party.id;
        // newObj.name = party.name;
        newObj.type = 'party';
        newObj.entity = party.entity;

        if(party.hasOwnProperty('parent')) {
            newObj.parent = party.parent;
        }

        newObj.flags = JSON.parse(JSON.stringify(flags));
        newObj.contract_count = [];
        newObj.contract_count.push({ year: year, count: 1 });

        collection[party.id] = newObj;
    }
    else {
        if(obj.contract_count.filter( function(item) { return item.year == year } ).length == 0)
        {
            // Contracts for this party and this year have not been seen yet
            obj.contract_count.push({ year: year, count: 1 });

            // Iterate over flag categories and then flags
            Object.keys(flags).map( function(key, index) {
                Object.keys(flags[key]).map( function(subkey, subindex) {
                    // Get flag score for current flag in current contract year
                    var year_flag = flags[key][subkey].filter( function(item) { return item.year == year } )[0];
                    obj.flags[key][subkey].push( { year: year, score: year_flag.score } );
                } );
            } );
        }
        else {
            // Party has contracts in this year already
            Object.keys(flags).map( function(key, index) {
                Object.keys(flags[key]).map( function(subkey, subindex) {
                    // Get value to be averaged with current average
                    var new_value = flags[key][subkey].filter( function(item) { return item.year == year } )[0].score;
                    // Get current average
                    var old_value = obj.flags[key][subkey].filter( function(item) { return item.year == year } )[0].score;
                    // Get contract_count for current year
                    var contract_count = obj.contract_count.filter( function(item) { return item.year == year } )[0].count;

                    // Y ahora, aplicamos la fórmula mágica! (Kept in Spanish for now)
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

            // Don't forget: increase contract_count after contract has been processed
            obj.contract_count.map( (item) => {
                if(item.year == year) item.count += 1;
                return item;
            } );
        }
    }
}

function getContractCriteriaSummary(collection, criteriaObj) {
    let summary = [];
    let tempCriteriaObj = JSON.stringify(criteriaObj);

    collection.map( (evaluation) => {
        let item = evaluation.contratoFlags;
        let contractFlagObj = {
            id: item.id,
            ocid: item.ocid,
            date_signed: item.hasOwnProperty('date_signed')? item.date_signed : null,
            parties: item.parties,
            value: item.value
        };
        let contract_score = JSON.parse(tempCriteriaObj);

        Object.assign(contractFlagObj, { contract_score });
        Object.assign(contractFlagObj, { rules_score: {} });

        // Iterate flag categories
        Object.keys(item.flags).map( function(categoria, index) {
            var flagCount = 0;
            contractFlagObj.rules_score[categoria] = {};

            // Iterate flags
            Object.keys(item.flags[categoria]).map( function(bandera, subindex) {
                contractFlagObj.rules_score[categoria][bandera] = item.flags[categoria][bandera][0].score;
                contractFlagObj.contract_score[categoria] += item.flags[categoria][bandera][0].score;
                flagCount++;
            } );

            contractFlagObj.contract_score[categoria] /= flagCount;
        } );

        // Calculate the global total_score
        var global_total = 0;
        var num_categorias = 0;
        Object.keys(contractFlagObj.contract_score).map( function(cat, index) {
            if(cat != 'total_score') {
                global_total += contractFlagObj.contract_score[cat];
                num_categorias++;
            }
        } );
        contractFlagObj.contract_score.total_score = global_total / num_categorias;

        summary.push(contractFlagObj);
    } );

    return summary;
}

function getPartyCriteriaSummary(collection, criteriaObj) {
    let summary = [];
    let tempCriteriaObj = JSON.stringify(criteriaObj);

    collection.map( (item) => {
        let party = {
            id: item.id,
            type: item.entity
        };

        if(item.hasOwnProperty('parent')) {
            Object.assign( party, { parent: item.parent } )
        }

        let contract_score = JSON.parse(tempCriteriaObj);
        let years = [];
        let partyFlagObj = {
            party,
            contract_score,
            rules_score: {},
            years
        };

        // Iterate categories
        Object.keys(item.flags).map( function(categoria, index) {
            var flagCount = 0;
            partyFlagObj.rules_score[categoria] = {};

            // Iterate flags
            Object.keys(item.flags[categoria]).map( function(bandera, subindex) {
                var scoreCount = 0;
                var scoreSum = 0;
                partyFlagObj.rules_score[categoria][bandera] = {};

                // Iterate years with a score for the flag
                item.flags[categoria][bandera].map( (score) => {
                    if( partyFlagObj.years.filter( (yearObj) => { return yearObj.year == score.year } ).length == 0 ) {
                        let criteriaYearObj = {
                            year: score.year,
                            contract_score: JSON.parse(tempCriteriaObj),
                            rules_score: {}
                        }
                        partyFlagObj.years.push(criteriaYearObj);
                    }

                    partyFlagObj.years.map( (yearObj) => {
                        if(yearObj.year == score.year) {
                            yearObj.contract_score[categoria] += score.score;
                            if( !yearObj.rules_score[categoria] ) yearObj.rules_score[categoria] = {};
                            yearObj.rules_score[categoria][bandera] = score.score;
                            scoreSum += score.score;
                        }
                    } );
                    scoreCount++;
                } );

                // Calculate average of all year scores for each individual rule score
                partyFlagObj.rules_score[categoria][bandera] = scoreSum / scoreCount;

                flagCount++;
            } );

            // Calculate averages for this category and this year
            partyFlagObj.years.map( (yearObj) => {
                yearObj.contract_score[categoria] /= flagCount;
                partyFlagObj.contract_score[categoria] += yearObj.contract_score[categoria];
            } );

            partyFlagObj.contract_score[categoria] /= partyFlagObj.years.length;
        } );

        // Calculate total_scores per year
        partyFlagObj.years.map( (yearObj) => {
            var year_total = 0;
            var num_categorias = 0;
            Object.keys(yearObj.contract_score).map( function(cat, index) {
                if(cat != 'total_score') {
                    year_total += yearObj.contract_score[cat];
                    num_categorias++;
                }
            } );
            yearObj.contract_score.total_score = year_total / num_categorias;
        } )

        // Calculate contract total_score
        var global_total = 0;
        var num_categorias = 0;
        Object.keys(partyFlagObj.contract_score).map( function(cat, index) {
            if(cat != 'total_score') {
                global_total += partyFlagObj.contract_score[cat];
                num_categorias++;
            }
        } );
        partyFlagObj.contract_score.total_score = global_total / num_categorias;

        summary.push(partyFlagObj);
    } );

    return summary;
}

function getPartyNodeSummary(collection, nodeScores) {
    let summary = [];
    collection.map( (item) => {
        if(nodeScores[item.party.id]) {
            let node_score = nodeScores[item.party.id];

            // Assign node_score object to top level
            let node_scores_sum = 0;
            let node_score_count = 0;
            Object.keys(node_score.nodeScore).map( (x) => {
                node_scores_sum += node_score.nodeScore[x];
                node_score_count++;
            } );
            let node_total_score = node_scores_sum / node_score_count;
            Object.assign( node_score.nodeScore, { 'total_score': node_total_score } );
            Object.assign( item, { 'node_score': node_score.nodeScore } );

            let total_score = (item.contract_score.total_score + node_total_score) / 2;
            Object.assign( item, { 'total_score': total_score } );

            // Assign each node_score object to each evaluated year
            item.years.map( (year) => {
                if(node_score.years[year.year]) {
                    let year_node_scores_sum = 0;
                    let year_node_scores_count = 0;
                    Object.keys(node_score.years[year.year].nodeScore).map( (x) => {
                        if(node_score.years[year.year].nodeScore[x].hasOwnProperty('score'))
                            year_node_scores_sum += node_score.years[year.year].nodeScore[x].score;
                        else
                            year_node_scores_sum += node_score.years[year.year].nodeScore[x];
                        year_node_scores_count++;
                    } );
                    let year_node_total_score = year_node_scores_sum / year_node_scores_count;
                    Object.assign( node_score.years[year.year].nodeScore, { 'total_score': year_node_total_score } );
                    Object.assign( year, { 'node_score': node_score.years[year.year].nodeScore } );
                }
            } );
        }
        else {
            console.log('Node score not found:', item.party.id);
        }

        summary.push(item);
    } );

    return summary;
}

// Receives a chunk of an object collection, adds a hash to ensure uniqueness of id, and inserts in bulk to DB
// Array flagCollection: the chunk of objects to send to DB
// Object dbCollection: the DB collection object that the chunk is sent to
function sendCollectionToDB(flagCollection, dbCollection) {
    const operations = [];

    flagCollection.map( (flag) => {
        let flagHash = hash(flag);
        Object.assign(flag, { _id: flagHash });
        operations.push( { insertOne: { document: flag } } );
    } );
    return dbCollection.bulkWrite(operations, { ordered:true });
}

module.exports = {
    createFlagCollectionObject,
    updateFlagCollection,
    getPartyNodeSummary,
    getPartyCriteriaSummary,
    getContractCriteriaSummary,
    sendCollectionToDB
};
