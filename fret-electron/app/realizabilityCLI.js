const fs = require('fs');
const path = require('path');

import { checkRealizability, computeConnectedComponents, checkDependenciesExist } from '../model/realizabilitySupport/realizabilityUtils.js'
import { synchAnalysisWithDB } from '../model/fretDbSupport/analysisTabSupport.js';

export {checkRealizabilityCLI as checkRealizabilityCLI};

function checkRealizabilityCLI(program, project, component, timeout, solver, options) {
  // console.log(JSON.stringify(options))
  let dependencyCheck = checkDependenciesExist([]);
  if (dependencyCheck.dependenciesExist) {      
    let solverChoice;
    if (solver) {
      if (!dependencyCheck.missingDependencies.includes(solver)) {
        solverChoice = (solver === 'kind2') ? 0 : 2; //There are four engine options (kind2, kind2+mbp, jkind, jkind+mbp), but only two are available via CLI, as MBP options are not as performant, in the general case.
      } else {
        program.error('Cannot detect solver: '+solver)
      }
    } else {
      solverChoice = dependencyCheck.selectedEngine;
    }
    
    synchAnalysisWithDB(project).then(result => {
        let completedComponents = result.completedComponents;
        if (completedComponents && completedComponents.length > 0 && !completedComponents.includes(component)) {
          program.error('Variable mapping for system component "'+component+'" is not complete, or the specified component does not exist.');
        }

        let projectReport = {projectName: project, systemComponents: [{name: component}]};
        
        let componentObject = {component_name: component};          
        
        console.log('Checking realizability for '+project+':'+component+'...\n')
        
          computeConnectedComponents(project, component, componentObject, projectReport, []).then((result) => {
            // Currently, we need to initialize this object in order to access the realizability utility functions.        
            let rlzState = {
              selected: componentObject,
              ccSelected: 'cc0',
              monolithic: !result.compositional,     //If the specification can be decomposed, run compositional analysis by default.
              compositional: result.compositional, 
              timeout: timeout,
              realizableTraceLength: 4,
              projectReport: projectReport,
              retainFiles: program.opts().debug ? true : false, 
              selectedEngine: solverChoice
            };                

            checkRealizability(project, componentObject, rlzState, result.selectedReqs).then((out) => {    
              //systemComponents is an array of the project's system components. Each has its own report. We find the index of the target component in systemComponents, to retrieve the corresponding results.
              var systemComponentIndex = out.systemComponents.findIndex(sc => sc.name === component);
              if (options.json) {
                let output = JSON.stringify(out, undefined, 4);
                if (options.out) {
                  try {
                    let fullPath = path.resolve(options.out);
                    var outputFile = fs.openSync(fullPath, 'w');
                    fs.writeSync(outputFile, output);
                    console.log('Saved results to '+fullPath);
                  } catch (err) {
                    program.error('Something went wrong when writing to file. Details:\n'+err)
                  }
                } else {
                  console.log(output);
                }
              } else {
                console.log("Result: "+out.systemComponents[systemComponentIndex].monolithic.result);
                console.log("Time: "+out.systemComponents[systemComponentIndex].monolithic.time);
              }        
            }).catch(err => program.error('Something went wrong when checking realizability. Details:\n'+err))      
          }).catch(err => program.error('Something went wrong when computing connected components. Details:\n'+err))
    }).catch(err => program.error('Something went wrong when accessing the databases. Details:\n'+err))    
  } else {
    let missingDependencies = dependencyCheck.missingDependencies
    requiredDependenciesMessage = 'No valid solver configuration can be found. Cannot detect dependencies: ' + missingDependencies.map (mD => (mD === 'aeval' ? 'aeval (optional)' : mD)).toString()
    program.error(requiredDependenciesMessage);
  }

}