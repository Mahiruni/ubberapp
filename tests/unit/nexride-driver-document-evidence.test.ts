import {describe,expect,it} from "vitest";
import {isDriverDocumentPath,isDriverDocumentEvidence,MAX_DRIVER_DOCUMENT_BYTES} from "../../lib/nexride-driver-document-evidence";
describe("private NexRide driver verification",()=>{
  const owner="12345678-1234-4123-8123-123456789abc";
  it("allows actual owner paths",()=>{
    expect(isDriverDocumentPath(owner+"/driver-license-20261008.jpg",owner)).toBe(true);
    expect(isDriverDocumentPath(owner+"/vehicle-registration.pdf",owner)).toBe(true);
  });
  it("rejects wrong owners, traversal and unexpected files",()=>{
    for(const path of ["someone-else/file.pdf",owner+"/../file.pdf",owner+"/",owner+"/nested/file.pdf",owner+"/payload.exe"]){
      expect(isDriverDocumentPath(path,owner)).toBe(false);
    }
  });
  it("requires an existing nonempty image/PDF with safe dimensions",()=>{
    expect(isDriverDocumentEvidence({size:100,contentType:"application/pdf"})).toBe(true);
    expect(isDriverDocumentEvidence({size:100,contentType:"image/jpeg; charset=UTF-8"})).toBe(true);
    expect(isDriverDocumentEvidence({size:0,contentType:"image/png"})).toBe(false);
    expect(isDriverDocumentEvidence({size:MAX_DRIVER_DOCUMENT_BYTES+1,contentType:"image/png"})).toBe(false);
    expect(isDriverDocumentEvidence({size:100,contentType:"application/octet-stream"})).toBe(false);
    expect(isDriverDocumentEvidence(null)).toBe(false);
  });
});
