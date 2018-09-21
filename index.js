#!/usr/bin/env node
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const evaluateFlags = require('./evaluator/evaluate');
const { parseFlags, getCriteriaObject } = require('./evaluator/parser');
const {
    createFlagCollectionObject,
    updateFlagCollection,
    getPartyCriteriaSummary,
    getContractCriteriaSummary,
    sendPartyCollectionToDB,
    sendContractCollectionToDB
} = require('./evaluator/collection');

const optionDefinitions = [
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'flags', alias: 'f', type: String },
    { name: 'year', alias: 'y', type: String }
];
const args = commandLineArgs(optionDefinitions);

if(!args.database || !args.collection || !args.flags) {
    console.log('ERROR: missing parameters.');
    process.exit(1);
}
if(!args.year) {
    console.log('ERROR: you must specify a year.');
    process.exit(1);
}

let seenContracts = 0;
const flags = parseFlags(args.flags);
const flagCollectionObj = createFlagCollectionObject(flags);
const contractFlagCollection = [];
const partyFlagCollection = [];
const partyFlagIndex = [];

const query = {'contracts.period.startDate': {$gte: new Date(args.year + '-01-01T00:00:00.000Z'), $lte: new Date(args.year + '-12-31T23:59:59.000Z')}}

// Connection URL
const url = 'mongodb://localhost:27017/' + args.database;
const db = monk(url)
            .then( (db) => {
                console.log('Connected to ' + args.database + '...');
                console.time('duration');

                const contracts = db.get(args.collection, { castIds: false });

                console.log('Streaming contracts...');

                // PRIMERA PASADA
                // contracts.find({}, { limit: 100000, sort: { 'contracts.period.startDate': -1 } })
                contracts.find( query )
                    .each( (contract, {close, pause, resume}) => {
                        seenContracts++;
                        // console.log(JSON.stringify(contract, null, 4));
                        if( isValidContract(contract) ) {
                            // Realizar la evaluación del contrato
                            const evaluation = evaluateFlags(contract, flags, flagCollectionObj);
                            contractFlagCollection.push(evaluation.contratoFlags);

                            // Asignar valores del contractScore a los parties
                            evaluation.contratoFlags.parties.map( (party) => {
                                // Actualizar array global de objetos para party_flags
                                updateFlagCollection(party, partyFlagCollection, partyFlagIndex, evaluation.year, evaluation.contratoFlags.flags);
                            } );
                        }
                    } )
                    .then( () => {
                        if(seenContracts == 0) {
                            console.log('No contracts seen.');
                            process.exit(0);
                        }
                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------

                        // SEGUNDA PASADA VA AQUI

                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------

                        // Insertar PARTY_FLAGS a la DB:
                        // Dividir el array en chunks de 1000, para cada chunk se convierte la data en el objeto para
                        // la DB, luego se envía el listado de objetos para insert/update en la DB
                        const chunkSize = 1000;
                        var numChunks = 0;
                        var upsertedChunks = 0;
                        var totalModified = 0;
                        var totalUpserted = 0;

                        var arrayLength = partyFlagCollection.length;
                        var expectedChunks = Math.floor(arrayLength / chunkSize) + 1;
                        var criteriaObj = getCriteriaObject(flags);
                        var dbCollection = db.get('party_flags', { castIds: false });

                        for(i = 0; i < arrayLength; i += chunkSize) {
                            numChunks++;
                            console.log('PARTIES Chunk ' + numChunks);

                            var partyChunk = partyFlagCollection.slice(i, i + chunkSize);
                            var party_flags = getPartyCriteriaSummary(partyChunk, criteriaObj);

                            // Send chunk to DB...
                            var upsertPromises = sendPartyCollectionToDB(party_flags, dbCollection);
                            // console.log(JSON.stringify(party_flags, null, 4));
                            Promise.all([upsertPromises]).then((results) => {
                                upsertedChunks++;
                                console.log('---------------------------------------------------------------------------');
                                console.log('RESULT for chunk ' + upsertedChunks);
                                console.log('MODIFIED:', results[0].modifiedCount, 'UPSERTED:', results[0].upsertedCount);

                                totalModified += results[0].modifiedCount;
                                totalUpserted += results[0].upsertedCount;

                                if(upsertedChunks == expectedChunks) {
                                    console.log('---------------------------------------------------------------------------');
                                    console.log('PARTY_FLAGS: DONE!');
                                    console.log('MODIFIED:', totalModified, 'UPSERTED:', totalUpserted);
                                    console.log('---------------------------------------------------------------------------');

                                    // Insertar CONTRACT_FLAGS a la DB:
                                    // Dividir el array en chunks de 1000, para cada chunk se convierte la data en el objeto para
                                    // la DB, luego se envía el listado de objetos para insert/update en la DB
                                    numChunks = 0;
                                    upsertedChunks = 0;
                                    totalModified = 0;
                                    totalUpserted = 0;

                                    arrayLength = contractFlagCollection.length;
                                    expectedChunks = Math.floor(arrayLength / chunkSize) + 1;
                                    criteriaObj = getCriteriaObject(flags);
                                    dbCollection = db.get('contract_flags', { castIds: false });

                                    for(i = 0; i < arrayLength; i += chunkSize) {
                                        numChunks++;
                                        console.log('CONTRACTS Chunk ' + numChunks);

                                        var contractChunk = contractFlagCollection.slice(i, i + chunkSize);
                                        var contract_flags = getContractCriteriaSummary(contractChunk, criteriaObj);

                                        // Send chunk to DB...
                                        var upsertPromises = sendContractCollectionToDB(contract_flags, dbCollection);
                                        // console.log(JSON.stringify(party_flags, null, 4));
                                        Promise.all([upsertPromises]).then((results) => {
                                            upsertedChunks++;

                                            console.log('---------------------------------------------------------------------------');
                                            console.log('RESULT for chunk ' + upsertedChunks);
                                            console.log('INSERTED:', results[0].nInserted);

                                            totalUpserted += results[0].nInserted;

                                            if(upsertedChunks == expectedChunks) {
                                                console.log('---------------------------------------------------------------------------');
                                                console.log('CONTRACT_FLAGS: DONE!');
                                                console.log('INSERTED:', totalUpserted);
                                                console.log('---------------------------------------------------------------------------');

                                                console.log(contractFlagCollection.length + ' contratos procesados.');
                                                console.log(partyFlagCollection.length + ' entidades procesadas.');
                                                console.timeEnd('duration');

                                                // ------------- THE END -------------
                                                process.exit(0);
                                                // ------------- THE END -------------
                                            }
                                        }).catch(e => { console.log('PROMISE ERROR', e) });
                                    }
                                }
                            }).catch(e => { console.log('PROMISE ERROR', e) });
                        }

                        console.log('End streaming.');
                    } );
            } )
            .catch( (err) => { console.log('Error connecting to ' + args.database, err) } );

function isValidContract(contract) {
    return contract.hasOwnProperty('parties') && contract.hasOwnProperty('contracts');
}
