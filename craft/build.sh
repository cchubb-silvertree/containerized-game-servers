#!/bin/bash
  
account=$(aws sts get-caller-identity --output text --query Account)
region="us-west-2"
repo="craft"
repo_name='.dkr.ecr.'$region'.amazonaws.com/'$repo':arm0.6'
repo_url=$account$repo_name

aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $repo_url
docker build -t $repo .
docker tag $repo:latest $repo_url
docker push $repo_url
