#!/usr/bin/env node
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const evaluateFlags = require('./evaluator/evaluate');
const { parseFlags, getCriteriaObject } = require('./evaluator/parser');
const { createFlagCollectionObject, updateFlagCollection, getCriteriaSummary, sendCollectionToDB } = require('./evaluator/collection');

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

const flags = parseFlags(args.flags);
const flagCollectionObj = createFlagCollectionObject(flags);
const contractFlagCollection = [];
const partyFlagCollection = [];

const query = {'contracts.period.startDate': {$gt: new Date(args.year + '-01-01T00:00:00.000Z'), $lt: new Date(args.year + '-12-31T23:59:59.000Z')}}

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
                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------
                        // console.log(JSON.stringify(contract, null, 4));
                        if( isValidContract(contract) ) {
                            // Realizar la evaluación del contrato
                            const evaluation = evaluateFlags(contract, flags, flagCollectionObj);
                            contractFlagCollection.push(evaluation.contratoFlags);

                            // Asignar valores del contractScore a los parties
                            evaluation.contratoParties.map( (party) => {
                                // Actualizar array global de objetos para party_flags
                                updateFlagCollection(party, partyFlagCollection, evaluation.year, evaluation.contratoFlags.flags);
                            } );
                        }
                        //console.log(partyFlagCollection);
                        //process.exit(0);
                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------
                    } )
                    .then( () => {
                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------

                        // SEGUNDA PASADA VA AQUI

                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------

                        // Dividir el array en chunks de 1000, para cada chunk se convierte la data en el objeto para
                        // la DB, luego se envía el listado de objetos para insert/update en la DB
                        const chunkSize = 1000;
                        var numChunks = 0;
                        var upsertedChunks = 0;
                        var totalInserted = 0;
                        var totalMatched = 0;
                        var totalModified = 0;
                        var totalUpserted = 0;

                        const arrayLength = partyFlagCollection.length;
                        const expectedChunks = Math.floor(arrayLength / chunkSize) + 1;
                        const criteriaObj = getCriteriaObject(flags);
                        const dbCollection = db.get('party_flags', { castIds: false });

                        for(i = 0; i < arrayLength; i += chunkSize) {
                            numChunks++;
                            console.log('START Chunk ' + numChunks);

                            var partyChunk = partyFlagCollection.slice(i, i + chunkSize);
                            var party_flags = getCriteriaSummary(partyChunk, criteriaObj);

                            // Send chunk to DB...
                            var upsertPromises = sendCollectionToDB(party_flags, dbCollection);
                            // console.log(JSON.stringify(party_flags, null, 4));
                            Promise.all([upsertPromises]).then((results) => {
                                upsertedChunks++;
                                console.log('---------------------------------------------------------------------------');
                                console.log('RESULT for chunk ' + upsertedChunks);
                                console.log('INSERTED:', results[0].insertedCount);
                                console.log('MATCHED:', results[0].matchedCount);
                                console.log('MODIFIED:', results[0].modifiedCount);
                                console.log('UPSERTED:', results[0].upsertedCount);

                                totalInserted += results[0].insertedCount;
                                totalMatched += results[0].matchedCount;
                                totalModified += results[0].modifiedCount;
                                totalUpserted += results[0].upsertedCount;

                                if(upsertedChunks == expectedChunks) {
                                    console.log('---------------------------------------------------------------------------');
                                    console.log('DONE!');
                                    console.log('INSERTED:', totalInserted);
                                    console.log('MATCHED:', totalMatched);
                                    console.log('MODIFIED:', totalModified);
                                    console.log('UPSERTED:', totalUpserted);
                                    console.log('---------------------------------------------------------------------------');
                                    console.timeEnd('duration');
                                    process.exit(0);
                                }
                            }).catch(e => { console.log('PROMISE ERROR', e) });

                            console.log('END Chunk ' + numChunks);
                        }

                        console.log(contractFlagCollection.length + ' contratos procesados.');
                        console.log(partyFlagCollection.length + ' entidades procesadas.');
                        console.log('End streaming.');
                        // process.exit(0);
                    } );
            } )
            .catch( (err) => { console.log('Error connecting to ' + args.database, err) } );

function isValidContract(contract) {
    return contract.hasOwnProperty('parties') && contract.hasOwnProperty('contracts');
}
