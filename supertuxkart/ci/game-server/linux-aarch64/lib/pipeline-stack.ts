import { Stack, StackProps, CfnParameter  } from 'aws-cdk-lib';
import { Construct } from 'constructs'
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as notifications from 'aws-cdk-lib/aws-codestarnotifications';

export class StkPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

  //parameters that can be passed from the command line
  const gitRepoName = new CfnParameter(this, "gitRepoName", {
  type: "String",
  description: "The git repository hosting application code",
  default: "stk-docker-build"
  });
  
  
  const baseImageVersion = new CfnParameter(this, "baseImageVersion", {
  type: "String",
  description: "The supertuxkart docker image version",
  default: "latest"
  });
  
  const ecrRepoName = new CfnParameter(this, "ecrRepoName", {
  type: "String",
  description: "The name of the ecr registry",
  default: "stk"
  });

  //codecommit repository that will contain the containerized app to build
  const repo = new codecommit.Repository(this, `gitRepo`, {
      repositoryName: gitRepoName.valueAsString,
      description: "New repository for demo project.",
      code: codecommit.Code.fromDirectory('./serverfiles','main'),
     
  });
    
  //docker repository to store container images
  const registry = new ecr.Repository(this,`game-servers`, {
      repositoryName: ecrRepoName.valueAsString,
      imageScanOnPush: true,
    });

    
  //codebuild project to build docker containers
  // we are reading the build spec from the code, but you could also read it from a file
  // that way the build commands are abstracted from the pipeline
  const buildproject = new codebuild.Project(this, `STKgameServerDockerBuild`, {
       environment: {
            privileged: true,
            buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_ARM_2
         },
      //cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER, codebuild.LocalCacheMode.CUSTOM),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [`docker build -t ${this.account}.dkr.ecr.${this.region}.amazonaws.com/${registry.repositoryName}:${baseImageVersion.valueAsString} .`,
            `aws ecr get-login-password --region ${this.region} | docker login --username AWS --password-stdin ${this.account}.dkr.ecr.${this.region}.amazonaws.com/${registry.repositoryName}`,
            `docker push ${this.account}.dkr.ecr.${this.region}.amazonaws.com/${registry.repositoryName}:${baseImageVersion.valueAsString}`],
          }
           
        },
        artifacts: {
             files: ['imageDetail.json']
           },
        
      }),
    });
    
  //we allow the buildProject principal to push images to ecr
  registry.grantPullPush(buildproject.grantPrincipal);

  // here we define our pipeline and put together the assembly line
  // using each of the components we created earlier
    const sourceOuput = new codepipeline.Artifact();
    const pipeline = new codepipeline.Pipeline(this,`containerPipeline`, {
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'CodeCommit_Source',
              repository: repo,
              output: sourceOuput,
              branch: 'main'
            }),
          ]
        },
        {
          stageName: 'DockerBuild',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Build_Code',
              input: sourceOuput,
              project: buildproject
             
            }),
          ]
        }
      ]
    });
  }
}
