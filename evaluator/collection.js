function createFlagCollectionObject(flags) {
    let flagCollObj = {
        id: '',
        type: '', // Valores: contract, party
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

function updateFlagCollection(id, collection, year, flags) {
    let obj = findObjectInCollection(id, collection);

    if(obj === undefined) {
        // No existe el party todavía...
        let newObj = {};
        newObj.id = id;
        newObj.type = 'party';
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

module.exports = { createFlagCollectionObject, updateFlagCollection };
