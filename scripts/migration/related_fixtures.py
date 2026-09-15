import copy
import hashlib


def fixtures():
    doc={'meta':{'town':'Fictional town','date':'2026-09-20','callsheet':{'notes':'Keep all fictional notes'}},
         'rows':[{'action':'Shoot','dur':'00:00','contactName':'Test Person','subLocations':[{'id':'gate','loc':'Test gate'}]}], 'savedAt':100}
    snapshot_key='snapshots_'+hashlib.sha256(b'alpha').hexdigest()
    base=[
        {'store':'schedule-snapshots','key':snapshot_key,'revision':1,'value':{'name':'alpha','updatedAt':100,'snapshots':[
            {'id':'old','savedAt':90,'label':'Original','data':copy.deepcopy(doc)},
            {'id':'keep','savedAt':95,'label':'Keep','data':copy.deepcopy(doc)}]}},
        {'store':'schedule-templates','key':'templates','revision':1,'value':{
            'Call template':{'rows':copy.deepcopy(doc['rows']),'savedAt':100},
            'Other template':{'rows':[],'savedAt':100}}},
        {'store':'schedule-library','key':'rp_library_index_v1','revision':1,'value':{
            'version':1,'updatedAt':100,'folders':[{'id':'folder-1','name':'Fictional folder','createdAt':50,'updatedAt':100}],
            'scheduleFolderMap':{'alpha':'folder-1','bravo':'folder-1'},'phaseOrder':{'production':{'shoot':['alpha','bravo']}},
            'productionDisplayNames':{'production':'Fictional production'},'phaseDisplayNames':{'production':{'shoot':'Shoot'}},
            'tsarchived':['bravo'],'townCache':{'alpha':'Fictional town'},'dateCache':{'alpha':'2026-09-20'}}},
        {'store':'cms','key':'rp_cms_config','revision':1,'value':{'actions':[{'name':'Shoot','color':'aShoot'}],
            'actionStyles':{'aShoot':{'bg':'#ffffff','text':'#000000'}},'colors':{'--accent':'#334455'},
            'labels':{'title':'Fictional title'},'logo':''}}
    ]
    latest=copy.deepcopy(base)
    for blob in latest: blob['revision']=2
    latest[0]['value']['updatedAt']=200
    latest[0]['value']['snapshots']=latest[0]['value']['snapshots'][1:]+[{'id':'new','savedAt':200,'label':'New snapshot','data':copy.deepcopy(doc)}]
    latest[1]['value']['Call template']['rows'][0]['contactName']='Updated Test Person'
    latest[1]['value']['New template']={'rows':[],'savedAt':200}
    latest[2]['value']['updatedAt']=200
    latest[2]['value']['phaseOrder']['production']['shoot']=['bravo','alpha']
    latest[2]['value']['folders'][0]['name']='Renamed folder'
    latest[2]['value']['folders'][0]['updatedAt']=200
    latest[2]['value']['tsarchived']=[]
    latest[3]['value']['labels']['title']='Improved fictional title'
    return base,latest
