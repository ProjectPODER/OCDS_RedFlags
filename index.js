#!/usr/bin/env node
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const evaluateFlags = require('./evaluator/evaluate');
const parseFlags = require('./evaluator/parser');
const { createFlagCollectionObject, updateFlagCollection } = require('./evaluator/collection');

const optionDefinitions = [
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'flags', alias: 'f', type: String },
];
const args = commandLineArgs(optionDefinitions);

if(!args.database || !args.collection || !args.flags) {
    console.log('ERROR: missing parameters.');
    process.exit(1);
}

const flags = parseFlags(args.flags);
const flagCollectionObj = createFlagCollectionObject(flags);
const contractFlagCollection = [];
const partyFlagCollection = [];

// Connection URL
const url = 'mongodb://localhost:27017/' + args.database;
const db = monk(url)
            .then( (db) => {
                console.log('Connected to ' + args.database + '...');
                console.time('duration');

                const contracts = db.get(args.collection, { castIds: false });

                console.log('Streaming contracts...');

                // PRIMERA PASADA
                contracts.find({})
                    .each( (contract, {close, pause, resume}) => {
                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------

                        if( isValidContract(contract) ) {
                            // Realizar la evaluación del contrato
                            const evaluation = evaluateFlags(contract, flags, flagCollectionObj);
                            contractFlagCollection.push(evaluation.contratoFlags);

                            // Asignar valores del contractScore a los parties
                            evaluation.contratoParties.map( (party) => {
                                // Actualizar array global de objetos para party_flags
                                updateFlagCollection(party.id, partyFlagCollection, evaluation.year, evaluation.contratoFlags.flags);
                            } );
                        }
                        //console.log(partyFlagCollection);
                        //process.exit(0);
                        // -----------------------------------------------------------------------------------------
                        // -----------------------------------------------------------------------------------------
                    } )
                    .then( () => {
                        console.log(contractFlagCollection.length + ' contratos procesados.');
                        console.log(partyFlagCollection.length + ' entidades procesadas.');
                        console.timeEnd('duration');
                        console.log('End streaming.');

                        // SEGUNDA PASADA VA AQUI
                        // Meter todos los objetos a la DB

                        process.exit(0);
                    } );
            } )
            .catch( (err) => { console.log('Error connecting to ' + args.database, err) } );

function isValidContract(contract) {
    return contract.hasOwnProperty('parties') && contract.hasOwnProperty('contracts');
}
