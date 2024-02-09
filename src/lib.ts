import * as fs from 'fs/promises';
import path from 'path';
import { isNativeError } from 'util/types';
import * as vscode from 'vscode';
import * as xml2js from 'xml2js';

export async function createResetDeploy() {
    try {
        const rootPath = tryGetRootPath();
        const defaultXml = `<deploy></deploy>`;
        await fs.writeFile(path.join(rootPath, 'deploy.xml'), defaultXml);
        vscode.window.showInformationMessage('Reset deploy.xml.');
    } catch (err) {
        logAndDisplayError(err);
    }
}

export async function addFileToDeploy(context?: any) {
    if (context && context.scheme !== 'file') {
        vscode.window.showWarningMessage(`Unknown file type '${context.scheme}' to add to deploy.xml`);
        return;
    }
    const rootPath = tryGetRootPath();
    const deployPath = path.join(tryGetRootPath(), 'deploy.xml');

    let currentFile: string;
    if (context && context.fsPath) {
        currentFile = (await fs.lstat(context.fsPath)).isDirectory() ? `${context.fsPath}${path.sep}*` : context.fsPath;
    } else {
        currentFile = vscode.window.activeTextEditor?.document.fileName ?? '';
    }

    const isFileInFileCabinet = currentFile.includes(path.join(rootPath, '/FileCabinet/SuiteScripts'));
    let isJavaScript = isFileInFileCabinet && currentFile.includes('.js');
    const isTypeScript = currentFile.includes('.ts');
    const isObject = currentFile.includes(path.join(rootPath, '/Objects')) && currentFile.includes('.xml');
    let matchedJavaScriptFile: string = '';

    if (!isFileInFileCabinet && !isJavaScript && !isObject) {
        if (isTypeScript) {
            const matchedJavaScriptFiles: string[] = [];
            const currentFileName = path.basename(currentFile);

            const getFiles = async (dir: string): Promise<string[]> => {
                const subdirs = (await fs.readdir(dir));
                const f = await Promise.all(
                    subdirs.map(async (subdir) => {
                        const res = path.resolve(dir, subdir);
                        return (await fs.stat(res)).isDirectory() ? getFiles(res) : res;
                    })
                );
                return Array.prototype.concat.apply([], f);
            };

            const files: string[] = await getFiles(path.join(rootPath, '/FileCabinet/SuiteScripts'));
            for (const file of files) {
                const fileName = path.basename(file);
                if (fileName.replace(/\.[^/.]+$/, '') === currentFileName.replace(/\.[^/.]+$/, '')) {
                    matchedJavaScriptFiles.push(file);
                }
            }

            if (matchedJavaScriptFiles.length) {
                isJavaScript = true;
                const currentFileParentDir = path.basename(path.dirname(currentFile));
                for (const file of matchedJavaScriptFiles) {
                    const fileParentDir = path.basename(path.dirname(file));
                    if (fileParentDir === currentFileParentDir) {
                        matchedJavaScriptFile = file;
                        break;
                    }
                }
                if (!matchedJavaScriptFile && matchedJavaScriptFiles.length === 1) {
                    matchedJavaScriptFile = matchedJavaScriptFiles[0];
                }
                if (matchedJavaScriptFile) {
                    currentFile = matchedJavaScriptFile;
                } else {
                    vscode.window.showErrorMessage(
                        'No matching compiled JavaScript file found in FileCabinet/SuiteScripts/**.'
                    );
                    return;
                }
            } else {
                vscode.window.showErrorMessage('No matching compiled JavaScript file found in FileCabinet/SuiteScripts/**.');
                return;
            }
        } else {
            vscode.window.showErrorMessage('Invalid file to add to deploy.xml. File is not a Script or an Object.');
            return;
        }
    }

    const xmlPathKey = isFileInFileCabinet || isJavaScript ? 'files' : 'objects';
    const relativePath = currentFile.replace(rootPath, '~').replace(/\\/gi, '/');

    const deployXmlExists = await fileExists(deployPath);
    if (!deployXmlExists) {
        createResetDeploy();
    }
    const deployXml = await fs.readFile(deployPath);
    const deployJs: DeployXML = await xml2js.parseStringPromise(deployXml);
    if (typeof deployJs.deploy === 'string') {
        deployJs.deploy = {};
    }
    const elements = deployJs.deploy[xmlPathKey]?.[0].path ?? [];
    if (elements.includes(relativePath)) {
        vscode.window.showInformationMessage(`${isObject ? 'Object' : 'File'} already exists in deploy.xml.`);
    } else {
        elements.push(relativePath);
        if (!deployJs.deploy[xmlPathKey]) {
            deployJs.deploy[xmlPathKey] = [{ path: [] }];
        }
        deployJs.deploy[xmlPathKey]![0].path = elements;

        const newXml = new xml2js.Builder({ headless: true }).buildObject(deployJs);
        await fs.writeFile(deployPath, newXml);
        vscode.window.showInformationMessage(
            `Added ${matchedJavaScriptFile ? 'matching compiled JavaScript' : ''} ${isObject ? 'object' : 'file'
            } to deploy.xml.`
        );
    }
}

type DeployXML = {
    deploy: string | {
        files?: [{ path: string[] }];
        objects?:  [{ path: string[] }];
    }
};

async function fileExists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

function logAndDisplayError(err: unknown): void {
    console.error(err);
    vscode.window.showErrorMessage(isNativeError(err) ? err.message : 'An unknown error occurred');
}

function tryGetRootPath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("Unable to determine root path");
    }
    return workspaceFolders[0].uri.fsPath;
}